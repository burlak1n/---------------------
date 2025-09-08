use sqlx::{SqlitePool, Sqlite, migrate::MigrateDatabase};
use chrono::Utc;
use std::env;
use std::sync::Arc;
use tokio::sync::RwLock;
use std::collections::HashMap;
use crate::{
    Slot, User, Record, Booking, CreateSlotRequest, CreateUserRequest, CreateBookingRequest,
    UpdateSlotRequest, UpdateUserRequest, BookingError, BookingInfo,
    // Event-Driven imports
    BroadcastEvent, BroadcastEventRecord, BroadcastSummary, BroadcastStatus, BroadcastMessageRecord, MessageStatus, BroadcastMessageType,
    CreateBroadcastCommand, BroadcastCreatedResponse, RetryMessageCommand, CancelBroadcastCommand,
    GetBroadcastStatusQuery, GetBroadcastMessagesQuery, BroadcastStatusResponse,
    // Voting system imports
    Vote, CreateVoteRequest, UpdateVoteRequest, SurveyVoteSummary, SurveyStatus, NextSurveyResponse, VoteResponse, UserSurvey,
    // Auth imports
    TelegramAuth, ExternalUserResponse, AuthResponse,
};

// Константы для магических чисел
const DEFAULT_QUERY_LIMIT: i32 = 100;
const DEFAULT_QUERY_OFFSET: i32 = 0;
const DEFAULT_BROADCAST_SUMMARIES_LIMIT: i32 = 50;
const DEFAULT_BROADCAST_SUMMARIES_OFFSET: i32 = 0;

// Константы для системы голосования
const MIN_VOTES_FOR_REVIEW: i64 = 3;

// Константы для алгоритма ранжирования слотов
const SLOT_RANKING_FREE_SLOTS_WEIGHT: f64 = 0.5;
const SLOT_RANKING_TIME_WEIGHT: f64 = 0.5;
const SLOT_RANKING_TIME_SCALE: f64 = 100.0;
const SLOT_RANKING_HALF_LIFE_HOURS: f64 = 48.0;

// Кеш для внешнего API
#[derive(Clone)]
pub struct ApiCache {
    users: Arc<RwLock<Option<(Vec<serde_json::Value>, chrono::DateTime<chrono::Utc>)>>>,
    surveys: Arc<RwLock<HashMap<i64, (serde_json::Value, chrono::DateTime<chrono::Utc>)>>>,
}

impl ApiCache {
    pub fn new() -> Self {
        Self {
            users: Arc::new(RwLock::new(None)),
            surveys: Arc::new(RwLock::new(HashMap::new())),
        }
    }
    
    // Кеш пользователей (10 минут)
    pub async fn get_users(&self) -> Option<Vec<serde_json::Value>> {
        let cache = self.users.read().await;
        if let Some((users, timestamp)) = cache.as_ref() {
            if Utc::now().signed_duration_since(*timestamp).num_minutes() < 10 {
                return Some(users.clone());
            }
        }
        None
    }
    
    pub async fn set_users(&self, users: Vec<serde_json::Value>) {
        let mut cache = self.users.write().await;
        *cache = Some((users, Utc::now()));
    }
    
    // Кеш анкет (10 минут)
    pub async fn get_survey(&self, telegram_id: i64) -> Option<serde_json::Value> {
        let cache = self.surveys.read().await;
        if let Some((survey, timestamp)) = cache.get(&telegram_id) {
            if Utc::now().signed_duration_since(*timestamp).num_minutes() < 10 {
                return Some(survey.clone());
            }
        }
        None
    }
    
    pub async fn set_survey(&self, telegram_id: i64, survey: serde_json::Value) {
        let mut cache = self.surveys.write().await;
        cache.insert(telegram_id, (survey, Utc::now()));
    }
}

// Глобальный кеш
static mut API_CACHE: Option<ApiCache> = None;
static INIT: std::sync::Once = std::sync::Once::new();

fn get_cache() -> &'static ApiCache {
    unsafe {
        INIT.call_once(|| {
            API_CACHE = Some(ApiCache::new());
        });
        API_CACHE.as_ref().unwrap()
    }
}

pub async fn init_db() -> Result<SqlitePool, anyhow::Error> {
    let db_url = env::var("DATABASE_URL").expect("DATABASE_URL must be set");
    if !Sqlite::database_exists(&db_url).await.unwrap_or(false) {
        Sqlite::create_database(&db_url).await?;
    }

    let pool = SqlitePool::connect(&db_url).await?;
    
    // Применяем миграции
    sqlx::migrate!("../migrations").run(&pool).await?;

    Ok(pool)
}

pub async fn get_available_slots(pool: &SqlitePool) -> Result<Vec<Slot>, sqlx::Error> {
    sqlx::query_as::<_, Slot>(
        "SELECT s.id, s.time, s.place, s.max_user, 
                COALESCE((SELECT COUNT(*) FROM records r WHERE r.slot_id = s.id), 0) as booked_count
         FROM slots s 
         WHERE (SELECT COUNT(*) FROM records r WHERE r.slot_id = s.id) < s.max_user"
    )
    .fetch_all(pool)
    .await
}

/// Вычисляет вес слота для ранжирования
fn calculate_slot_weight(slot: &Slot) -> f64 {
    let free_slots = slot.max_user as f64 - (slot.booked_count.unwrap_or(0) as f64);
    
    let time_factor = if slot.time > Utc::now() {
        let hours_until = (slot.time - Utc::now()).num_hours() as f64;
        (-hours_until / SLOT_RANKING_HALF_LIFE_HOURS).exp()
    } else {
        0.0
    };
    
    (free_slots * SLOT_RANKING_FREE_SLOTS_WEIGHT) + 
    (time_factor * SLOT_RANKING_TIME_SCALE * SLOT_RANKING_TIME_WEIGHT)
}

pub async fn get_best_slots_for_booking(pool: &SqlitePool, limit: i64) -> Result<Vec<Slot>, sqlx::Error> {
    let now = Utc::now().naive_utc();
    
    // Получаем все доступные слоты одним эффективным запросом
    let slots = sqlx::query_as::<_, Slot>(
        r#"
        SELECT
            s.id,
            s.time,
            s.place,
            s.max_user,
            COALESCE(booked_counts.count, 0) as booked_count
        FROM slots s
        LEFT JOIN (
            SELECT slot_id, COUNT(*) as count 
            FROM records 
            GROUP BY slot_id
        ) booked_counts ON s.id = booked_counts.slot_id
        WHERE s.time > ? AND COALESCE(booked_counts.count, 0) < s.max_user
        ORDER BY s.time ASC
        "#
    )
    .bind(now)
    .fetch_all(pool)
    .await?;
    
    // Вычисляем вес для каждого слота и сортируем
    let mut slots_with_weights: Vec<(Slot, f64)> = slots
        .into_iter()
        .map(|slot| {
            let weight = calculate_slot_weight(&slot);
            (slot, weight)
        })
        .collect();
    
    // Сортируем по весу (по убыванию) и берем топ-N
    slots_with_weights.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
    
    let result: Vec<Slot> = slots_with_weights
        .into_iter()
        .take(limit as usize)
        .map(|(slot, _)| slot)
        .collect();
    
    // Дополнительно сортируем результат по времени (хронологически)
    let mut final_result = result;
    final_result.sort_by(|a, b| a.time.cmp(&b.time));
    
    Ok(final_result)
}

pub async fn get_all_slots(pool: &SqlitePool) -> Result<Vec<Slot>, sqlx::Error> {
    sqlx::query_as::<_, Slot>(
        "SELECT s.id, s.time, s.place, s.max_user, 
                COALESCE((SELECT COUNT(*) FROM records r WHERE r.slot_id = s.id), 0) as booked_count
         FROM slots s 
         ORDER BY s.time ASC"
    )
    .fetch_all(pool)
    .await
}

pub async fn get_slot(pool: &SqlitePool, slot_id: i64) -> Result<Option<Slot>, sqlx::Error> {
    println!("DB: Получаем слот {}", slot_id);
    
    let result = sqlx::query_as::<_, Slot>(
        "SELECT s.id, s.time, s.place, s.max_user, 
                COALESCE((SELECT COUNT(*) FROM records r WHERE r.slot_id = s.id), 0) as booked_count
         FROM slots s 
         WHERE s.id = ?"
    )
    .bind(slot_id)
    .fetch_optional(pool)
    .await;
    
    match &result {
        Ok(Some(slot)) => println!("DB: Получен слот: {:?}", slot),
        Ok(None) => println!("DB: Слот {} не найден", slot_id),
        Err(e) => println!("DB: Ошибка при получении слота {}: {}", slot_id, e),
    }
    
    result
}

pub async fn create_or_update_booking(pool: &SqlitePool, telegram_id: i64, slot_id: Option<i64>) -> Result<(), BookingError> {
    // Сначала удаляем существующую запись пользователя
    sqlx::query("DELETE FROM records WHERE telegram_id = ?")
        .bind(telegram_id)
        .execute(pool)
        .await?;
    
    // Затем создаем новую запись
    if let Some(slot_id) = slot_id {
        // Проверяем лимит и создаем запись в одной транзакции
        let result = sqlx::query!(
            "INSERT INTO records (telegram_id, slot_id) 
             SELECT ?, ? 
             WHERE (SELECT COUNT(*) FROM records WHERE slot_id = ?) < (SELECT max_user FROM slots WHERE id = ?)",
            telegram_id, slot_id, slot_id, slot_id
        )
        .execute(pool)
        .await?;
        
        if result.rows_affected() == 0 {
            // Получаем детали для информативной ошибки
            let current_count: i64 = sqlx::query_scalar!(
                "SELECT COUNT(*) FROM records WHERE slot_id = ?",
                slot_id
            )
            .fetch_one(pool)
            .await?;
            
            let max_users: i64 = sqlx::query_scalar!(
                "SELECT max_user FROM slots WHERE id = ?",
                slot_id
            )
            .fetch_one(pool)
            .await?;
            
            return Err(BookingError::SlotFull { 
                max_users: max_users as u16, 
                current_count: current_count as u16 
            });
        }
    }
    
    Ok(())
}



pub async fn create_slot(pool: &SqlitePool, payload: CreateSlotRequest) -> Result<Slot, sqlx::Error> {
    let time = payload.start_time;
    let place = payload.place;
    let max_user = payload.max_users;
    let id = sqlx::query!(
        "INSERT INTO slots (time, place, max_user) VALUES (?, ?, ?)",
        time, place, max_user
    )
    .execute(pool)
    .await?
    .last_insert_rowid();

    get_slot(pool, id).await.map(|s| s.unwrap())
}

pub async fn create_booking(pool: &SqlitePool, payload: CreateBookingRequest) -> Result<Booking, BookingError> {
    let slot_id = payload.slot_id.parse::<i64>().unwrap();

    create_or_update_booking(pool, payload.telegram_id, Some(slot_id)).await?;

    Ok(Booking { slot_id: payload.slot_id, telegram_id: payload.telegram_id })
}

pub async fn get_users(pool: &SqlitePool) -> Result<Vec<i64>, sqlx::Error> {
    let rows = sqlx::query!(
        "SELECT telegram_id FROM user_roles WHERE role = 1"
    )
    .fetch_all(pool)
    .await?;
    
    Ok(rows.into_iter().filter_map(|row| row.telegram_id).collect())
}

/// Получает все голоса для статистики
pub async fn get_all_votes(pool: &SqlitePool) -> Result<Vec<Vote>, sqlx::Error> {
    sqlx::query_as::<_, Vote>("SELECT * FROM votes ORDER BY created_at DESC")
        .fetch_all(pool)
        .await
}

/// Получает анкету пользователя с внешнего API (с кешированием)
pub async fn get_user_survey_from_external_api(telegram_id: i64) -> Result<Option<serde_json::Value>, Box<dyn std::error::Error + Send + Sync>> {
    let cache = get_cache();
    
    // Проверяем кеш
    if let Some(survey) = cache.get_survey(telegram_id).await {
        return Ok(Some(survey));
    }
    
    // Загружаем с API
    let api_base_url = std::env::var("EXTERNAL_API_URL")
        .unwrap_or_else(|_| "http://localhost:3001".to_string());
    let url = format!("{}/api/users/{}/survey", api_base_url, telegram_id);
    let client = reqwest::Client::new();
    let response = client
        .get(&url)
        .header("X-Forwarded-For", "127.0.0.1")
        .send()
        .await?;
    
    if response.status().is_success() {
        let survey_data: serde_json::Value = response.json().await?;
        println!("🔍 Получены данные анкеты {}: {:?}", telegram_id, survey_data);
        // Сохраняем в кеш
        cache.set_survey(telegram_id, survey_data.clone()).await;
        Ok(Some(survey_data))
    } else {
        // Попробуем получить тело ответа для отладки
        if let Ok(error_text) = response.text().await {
            println!("❌ Тело ошибки survey API: {}", error_text);
        }
        Ok(None)
    }
}

/// Получает список всех пользователей с внешнего API (с кешированием и пагинацией)
pub async fn get_all_users_from_external_api() -> Result<Vec<serde_json::Value>, Box<dyn std::error::Error + Send + Sync>> {
    let cache = get_cache();
    
    // Проверяем кеш
    if let Some(users) = cache.get_users().await {
        return Ok(users);
    }
    
    // Загружаем всех пользователей с пагинацией
    let api_base_url = std::env::var("EXTERNAL_API_URL")
        .unwrap_or_else(|_| "http://localhost:3001".to_string());
    
    let mut all_users = Vec::new();
    let mut skip = 0;
    let limit = 100; // Размер страницы
    let client = reqwest::Client::new();
    
    loop {
        let users_url = format!("{}/api/users/completed?limit={}&skip={}", api_base_url, limit, skip);
        
        let response = client
            .get(&users_url)
            .header("X-Forwarded-For", "127.0.0.1")
            .send()
            .await?;
        
        if response.status().is_success() {
            let users: Vec<serde_json::Value> = response.json().await?;
            let users_count = users.len();
            
            if users.is_empty() {
                // Больше пользователей нет
                break;
            }
            
            all_users.extend(users);
            skip += limit;
            
            // Если получили меньше чем limit, значит это последняя страница
            if users_count < limit as usize {
                break;
            }
        } else {
            let status = response.status();
            // Попробуем получить тело ответа для отладки
            let error_text = response.text().await.unwrap_or_else(|_| "Не удалось получить текст ошибки".to_string());
            // Если это первая страница и она не удалась, возвращаем ошибку
            if skip == 0 {
                return Err(format!("Внешний API недоступен: статус {}", status).into());
            }
            // Если это не первая страница, просто прерываем цикл
            break;
        }
    }
    
    if !all_users.is_empty() {
        // Сохраняем в кеш только если получили пользователей
        cache.set_users(all_users.clone()).await;
    } else {
    }
    
    Ok(all_users)
}

pub async fn create_user(pool: &SqlitePool, payload: CreateUserRequest) -> Result<User, sqlx::Error> {
    // Создаем пользователя с ролью 1 в таблице user_roles
    sqlx::query!(
        "INSERT OR REPLACE INTO user_roles (telegram_id, role, created_at) VALUES (?, ?, CURRENT_TIMESTAMP)",
        payload.telegram_id,
        payload.role
    )
    .execute(pool)
    .await?;
    
    Ok(User { 
        telegram_id: payload.telegram_id, 
        name: payload.role.to_string(),
        telegram_nickname: None,
        phone_number: None,
        full_name: None,
    })
}

pub async fn get_user_by_telegram_id(_pool: &SqlitePool, telegram_id: i64) -> Result<Option<User>, sqlx::Error> {
    let api_base_url = std::env::var("USER_API_URL")
        .unwrap_or_else(|_| "https://api.ingroupsts.ru".to_string());
    
    let user_url = format!("{}/user/{}", api_base_url, telegram_id);
    
    // Делаем запрос к внешнему API для получения профиля пользователя
    let client = reqwest::Client::new();
    match client
        .get(&user_url)
        .header("X-Forwarded-For", "127.0.0.1")
        .send()
        .await {
        Ok(response) => {
            if response.status().is_success() {
                match response.json::<ExternalUserResponse>().await {
                    Ok(user_data) => {
                        // Создаем User из данных профиля
                        let profile = &user_data.user_profile;
                        let user = User {
                            telegram_id,
                            name: profile.full_name.clone().unwrap_or_else(|| 
                                profile.telegram_nickname.clone().unwrap_or_else(|| 
                                    format!("User {}", telegram_id)
                                )
                            ),
                            telegram_nickname: profile.telegram_nickname.clone(),
                            phone_number: profile.phone_number.clone(),
                            full_name: profile.full_name.clone(),
                        };
                        Ok(Some(user))
                    }
                    Err(e) => {
                        eprintln!("❌ Ошибка парсинга профиля пользователя {}: {}", telegram_id, e);
                        Err(sqlx::Error::Decode(Box::new(e)))
                    }
                }
            } else if response.status() == 404 {
                // Пользователь не найден
                Ok(None)
            } else {
                // Другая ошибка
                Err(sqlx::Error::Io(std::io::Error::new(
                    std::io::ErrorKind::Other, 
                    format!("HTTP error: {}", response.status())
                )))
            }
        }
        Err(e) => {
            eprintln!("❌ Ошибка запроса к внешнему API для пользователя {}: {}", telegram_id, e);
            Err(sqlx::Error::Io(std::io::Error::new(
                std::io::ErrorKind::Other, 
                format!("Request error: {}", e)
            )))
        }
    }
}

pub async fn get_todays_bookings(pool: &SqlitePool) -> Result<Vec<BookingInfo>, sqlx::Error> {
    let today = Utc::now().date_naive();
    sqlx::query_as::<_, BookingInfo>(
    "SELECT r.telegram_id, s.time, s.place FROM records r JOIN slots s ON r.slot_id = s.id WHERE date(s.time) = date(?)"
    )
    .bind(today.to_string())
    .fetch_all(pool)
    .await
}

pub async fn get_all_bookings(pool: &SqlitePool) -> Result<Vec<Record>, sqlx::Error> {
    sqlx::query_as::<_, Record>("SELECT * FROM records")
        .fetch_all(pool)
        .await
}

pub async fn update_slot(pool: &SqlitePool, slot_id: i64, payload: UpdateSlotRequest) -> Result<Slot, sqlx::Error> {
    println!("DB: Обновляем слот {} с данными: {:?}", slot_id, payload);
    
    // Если обновляется max_users, проверяем что новое значение не меньше текущего количества записанных
    if let Some(max_users) = payload.max_users {
        let current_booked: i64 = sqlx::query_scalar!(
            "SELECT COUNT(*) FROM records WHERE slot_id = ?",
            slot_id
        )
        .fetch_one(pool)
        .await?;
        
        println!("DB: Текущее количество записанных в слот {}: {}", slot_id, current_booked);
        
        if max_users < current_booked as u16 {
            return Err(sqlx::Error::Protocol(
                format!("Нельзя установить максимальное количество участников меньше {} (уже записано)", current_booked).into()
            ));
        }
    }
    
    // Выполняем обновления по отдельности для каждого поля
    if let Some(time) = payload.start_time {
        println!("DB: Обновляем время слота {} на {}", slot_id, time);
        sqlx::query!("UPDATE slots SET time = ? WHERE id = ?", time, slot_id)
            .execute(pool)
            .await?;
    }
    
    if let Some(place) = payload.place {
        println!("DB: Обновляем место слота {} на '{}'", slot_id, place);
        sqlx::query!("UPDATE slots SET place = ? WHERE id = ?", place, slot_id)
            .execute(pool)
            .await?;
    }
    
    if let Some(max_users) = payload.max_users {
        println!("DB: Обновляем max_user слота {} на {}", slot_id, max_users);
        sqlx::query!("UPDATE slots SET max_user = ? WHERE id = ?", max_users, slot_id)
            .execute(pool)
            .await?;
    }

    println!("DB: Получаем обновленный слот {}", slot_id);
    // Возвращаем обновленный слот
    get_slot(pool, slot_id).await.map(|s| s.unwrap())
}

pub async fn update_user(pool: &SqlitePool, telegram_id: i64, payload: UpdateUserRequest) -> Result<User, sqlx::Error> {
    // Обновляем роль пользователя в таблице user_roles
    sqlx::query!(
        "INSERT OR REPLACE INTO user_roles (telegram_id, role, created_at) VALUES (?, ?, CURRENT_TIMESTAMP)",
        telegram_id,
        payload.role
    )
    .execute(pool)
    .await?;
    
    Ok(User { 
        telegram_id, 
        name: payload.role.to_string(),
        telegram_nickname: None,
        phone_number: None,
        full_name: None,
    })
}

pub async fn delete_slot(pool: &SqlitePool, slot_id: i64) -> Result<(), sqlx::Error> {
    // Сначала удаляем все записи, связанные с этим слотом
    sqlx::query("DELETE FROM records WHERE slot_id = ?")
        .bind(slot_id)
        .execute(pool)
        .await?;

    // Затем удаляем сам слот
    sqlx::query("DELETE FROM slots WHERE id = ?")
        .bind(slot_id)
        .execute(pool)
        .await?;

    Ok(())
}

pub async fn delete_user(pool: &SqlitePool, telegram_id: i64) -> Result<(), sqlx::Error> {
    // Удаляем пользователя из таблицы user_roles (убираем из ответственных)
    sqlx::query("DELETE FROM user_roles WHERE telegram_id = ?")
        .bind(telegram_id)
        .execute(pool)
        .await?;

    // Удаляем все записи пользователя
    sqlx::query("DELETE FROM records WHERE telegram_id = ?")
        .bind(telegram_id)
        .execute(pool)
        .await?;

    Ok(())
}

pub async fn delete_booking(pool: &SqlitePool, booking_id: i64) -> Result<(), sqlx::Error> {
    sqlx::query("DELETE FROM records WHERE id = ?")
        .bind(booking_id)
        .execute(pool)
        .await?;

    Ok(())
}

pub async fn get_users_for_broadcast(_pool: &SqlitePool, _include_users_without_telegram: bool) -> Result<Vec<User>, sqlx::Error> {
    // Пока возвращаем пустой список, так как таблица users будет удалена
    // В будущем можно будет получать пользователей из внешней системы
    Ok(Vec::new())
}

// Event Store Functions

pub async fn save_broadcast_event(
    pool: &SqlitePool,
    event: &BroadcastEvent,
) -> Result<(), sqlx::Error> {
    let event_id = uuid::Uuid::new_v4().to_string();
    let event_type = match event {
        BroadcastEvent::BroadcastCreated { message_type, .. } => {
            if let Some(BroadcastMessageType::SignUp) = message_type {
                "BroadcastCreatedSignUp"
            } else {
                "BroadcastCreated"
            }
        },
        BroadcastEvent::BroadcastStarted { .. } => "BroadcastStarted",
        BroadcastEvent::MessageSent { .. } => "MessageSent",
        BroadcastEvent::MessageFailed { .. } => "MessageFailed",
        BroadcastEvent::MessageRetrying { .. } => "MessageRetrying",
        BroadcastEvent::BroadcastCompleted { .. } => "BroadcastCompleted",
    };
    
    let event_data = serde_json::to_string(event).map_err(|e| sqlx::Error::Protocol(format!("JSON serialization error: {}", e).into()))?;
    let broadcast_id = match event {
        BroadcastEvent::BroadcastCreated { broadcast_id, .. } => broadcast_id,
        BroadcastEvent::BroadcastStarted { broadcast_id, .. } => broadcast_id,
        BroadcastEvent::MessageSent { broadcast_id, .. } => broadcast_id,
        BroadcastEvent::MessageFailed { broadcast_id, .. } => broadcast_id,
        BroadcastEvent::MessageRetrying { broadcast_id, .. } => broadcast_id,
        BroadcastEvent::BroadcastCompleted { broadcast_id, .. } => broadcast_id,
    };

    let now = chrono::Utc::now().naive_utc();
    sqlx::query!(
        "INSERT INTO broadcast_events (event_id, broadcast_id, event_type, event_data, created_at, version) 
         VALUES (?, ?, ?, ?, ?, ?)",
        event_id,
        broadcast_id,
        event_type,
        event_data,
        now,
        1
    )
    .execute(pool)
    .await?;

    Ok(())
}

pub async fn get_broadcast_events(
    pool: &SqlitePool,
    broadcast_id: &str,
) -> Result<Vec<BroadcastEventRecord>, sqlx::Error> {
    let records = sqlx::query!(
        "SELECT event_id, broadcast_id, event_type, event_data, created_at, version 
         FROM broadcast_events 
         WHERE broadcast_id = ? 
         ORDER BY created_at ASC",
        broadcast_id
    )
    .fetch_all(pool)
    .await?
    .into_iter()
    .map(|row| BroadcastEventRecord {
        event_id: row.event_id.unwrap_or_default(),
        broadcast_id: row.broadcast_id,
        event_type: row.event_type,
        event_data: row.event_data,
        created_at: row.created_at,
        version: row.version,
    })
    .collect();

    Ok(records)
}

pub async fn is_event_processed(
    pool: &SqlitePool,
    event_id: &str,
    worker_id: &str,
) -> Result<bool, sqlx::Error> {
    let result = sqlx::query!(
        "SELECT event_id FROM processed_events WHERE event_id = ? AND worker_id = ?",
        event_id,
        worker_id
    )
    .fetch_optional(pool)
    .await?;

    Ok(result.is_some())
}

// Read Model Functions

pub async fn create_broadcast_summary(
    pool: &SqlitePool,
    summary: &BroadcastSummary,
) -> Result<(), sqlx::Error> {
    let status_str = summary.status.to_string();
    sqlx::query!(
        "INSERT INTO broadcast_summaries (id, message, total_users, sent_count, failed_count, pending_count, status, created_at) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        summary.id,
        summary.message,
        summary.total_users,
        summary.sent_count,
        summary.failed_count,
        summary.pending_count,
        status_str,
        summary.created_at
    )
    .execute(pool)
    .await?;

    Ok(())
}

pub async fn update_broadcast_summary(
    pool: &SqlitePool,
    summary: &BroadcastSummary,
) -> Result<(), sqlx::Error> {
    let status_str = summary.status.to_string();
    sqlx::query!(
        "UPDATE broadcast_summaries 
         SET sent_count = ?, failed_count = ?, pending_count = ?, status = ?, started_at = ?, completed_at = ? 
         WHERE id = ?",
        summary.sent_count,
        summary.failed_count,
        summary.pending_count,
        status_str,
        summary.started_at,
        summary.completed_at,
        summary.id
    )
    .execute(pool)
    .await?;

    Ok(())
}

pub async fn update_broadcast_status(
    pool: &SqlitePool,
    broadcast_id: &str,
    sent_count: u32,
    failed_count: u32,
) -> Result<(), sqlx::Error> {
    // Получаем текущую сводку рассылки
    let summary = get_broadcast_summary(pool, broadcast_id).await?;
    
    if let Some(mut current_summary) = summary {
        // Обновляем счетчики
        current_summary.sent_count = sent_count as i64;
        current_summary.failed_count = failed_count as i64;
        
        // Получаем реальное количество pending сообщений из БД
        let pending_count = sqlx::query!(
            "SELECT COUNT(*) as count FROM broadcast_messages WHERE broadcast_id = ? AND status = 'pending'",
            broadcast_id
        )
        .fetch_one(pool)
        .await?
        .count;
        
        current_summary.pending_count = pending_count;
        
        // Определяем статус на основе реального состояния сообщений
        let (status, completed_at) = if pending_count == 0 && current_summary.total_users > 0 {
            // Все сообщения обработаны
            (BroadcastStatus::Completed, Some(chrono::Utc::now().naive_utc()))
        } else if current_summary.total_users > 0 {
            // Есть pending сообщения
            (BroadcastStatus::InProgress, None)
        } else {
            // Нет пользователей
            (BroadcastStatus::Pending, None)
        };
        
        current_summary.status = status;
        current_summary.completed_at = completed_at;
        
        // Обновляем сводку
        update_broadcast_summary(pool, &current_summary).await?;
    }

    Ok(())
}

pub async fn update_broadcast_summary_from_messages(
    pool: &SqlitePool,
    broadcast_id: &str,
) -> Result<(), sqlx::Error> {
    // Получаем актуальную статистику по сообщениям
    let sent_count = sqlx::query!(
        "SELECT COUNT(*) as count FROM broadcast_messages WHERE broadcast_id = ? AND status = 'sent'",
        broadcast_id
    )
    .fetch_one(pool)
    .await?
    .count;

    let failed_count = sqlx::query!(
        "SELECT COUNT(*) as count FROM broadcast_messages WHERE broadcast_id = ? AND status = 'failed'",
        broadcast_id
    )
    .fetch_one(pool)
    .await?
    .count;

    let pending_count = sqlx::query!(
        "SELECT COUNT(*) as count FROM broadcast_messages WHERE broadcast_id = ? AND status = 'pending'",
        broadcast_id
    )
    .fetch_one(pool)
    .await?
    .count;

    // Получаем текущую сводку
    let summary = get_broadcast_summary(pool, broadcast_id).await?;
    
    if let Some(mut current_summary) = summary {
        // Обновляем счетчики
        current_summary.sent_count = sent_count;
        current_summary.failed_count = failed_count;
        current_summary.pending_count = pending_count;
        
        // Определяем статус на основе реального состояния
        if pending_count == 0 && current_summary.total_users > 0 {
            // Все сообщения обработаны
            current_summary.status = BroadcastStatus::Completed;
            current_summary.completed_at = Some(chrono::Utc::now().naive_utc());
        } else if current_summary.total_users > 0 {
            // Есть pending сообщения
            current_summary.status = BroadcastStatus::InProgress;
        }
        
        // Обновляем сводку с новыми счетчиками
        update_broadcast_summary(pool, &current_summary).await?;
    }

    Ok(())
}

pub async fn get_broadcast_summary(
    pool: &SqlitePool,
    broadcast_id: &str,
) -> Result<Option<BroadcastSummary>, sqlx::Error> {
    let record = sqlx::query!(
        "SELECT id, message, total_users, sent_count, failed_count, pending_count, status, created_at, started_at, completed_at 
         FROM broadcast_summaries 
         WHERE id = ?",
        broadcast_id
    )
    .fetch_optional(pool)
    .await?;

    match record {
        Some(r) => Ok(Some(BroadcastSummary {
            id: r.id.unwrap_or_default(),
            message: r.message,
            total_users: r.total_users,
            sent_count: r.sent_count,
            failed_count: r.failed_count,
            pending_count: r.pending_count,
            status: BroadcastStatus::from(r.status),
            created_at: r.created_at,
            started_at: r.started_at,
            completed_at: r.completed_at,
        })),
        None => Ok(None),
    }
}

pub async fn get_all_broadcast_summaries(
    pool: &SqlitePool,
    limit: Option<i32>,
    offset: Option<i32>,
) -> Result<Vec<BroadcastSummary>, sqlx::Error> {
    let limit = limit.unwrap_or(DEFAULT_BROADCAST_SUMMARIES_LIMIT);
    let offset = offset.unwrap_or(DEFAULT_BROADCAST_SUMMARIES_OFFSET);
    
    let records = sqlx::query!(
        "SELECT id, message, total_users, sent_count, failed_count, pending_count, status, created_at, started_at, completed_at 
         FROM broadcast_summaries 
         ORDER BY created_at DESC 
         LIMIT ? OFFSET ?",
        limit,
        offset
    )
    .fetch_all(pool)
    .await?;

    let summaries = records
        .into_iter()
        .map(|r| BroadcastSummary {
            id: r.id.unwrap_or_default(),
            message: r.message,
            total_users: r.total_users,
            sent_count: r.sent_count,
            failed_count: r.failed_count,
            pending_count: r.pending_count,
            status: BroadcastStatus::from(r.status),
            created_at: r.created_at,
            started_at: r.started_at,
            completed_at: r.completed_at,
        })
        .collect();

    Ok(summaries)
}

pub async fn create_broadcast_message(
    pool: &SqlitePool,
    message: &BroadcastMessageRecord,
) -> Result<(), sqlx::Error> {
    let status_str = message.status.to_string();
    let message_type_str = message.message_type.as_ref().map(|mt| match mt {
        BroadcastMessageType::Custom => "custom",
        BroadcastMessageType::SignUp => "signup",
    });
    sqlx::query!(
        "INSERT INTO broadcast_messages (broadcast_id, telegram_id, status, error, sent_at, retry_count, message_type, created_at) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        message.broadcast_id,
        message.telegram_id,
        status_str,
        message.error,
        message.sent_at,
        message.retry_count,
        message_type_str,
        message.created_at
    )
    .execute(pool)
    .await?;

    Ok(())
}

pub async fn update_broadcast_message(
    pool: &SqlitePool,
    message: &BroadcastMessageRecord,
) -> Result<(), sqlx::Error> {
    let status_str = message.status.to_string();
    sqlx::query!(
        "UPDATE broadcast_messages 
         SET status = ?, error = ?, sent_at = ?, retry_count = ? 
         WHERE broadcast_id = ? AND telegram_id = ?",
        status_str,
        message.error,
        message.sent_at,
        message.retry_count,
        message.broadcast_id,
        message.telegram_id
    )
    .execute(pool)
    .await?;

    Ok(())
}

pub async fn update_broadcast_message_status(
    pool: &SqlitePool,
    broadcast_id: &str,
    telegram_id: i64,
    status: MessageStatus,
    error: Option<String>,
) -> Result<(), sqlx::Error> {
    let status_str = status.to_string();
    let sent_at = if status == MessageStatus::Sent {
        Some(chrono::Utc::now().naive_utc())
    } else {
        None
    };

    sqlx::query!(
        "UPDATE broadcast_messages 
         SET status = ?, error = ?, sent_at = ? 
         WHERE broadcast_id = ? AND telegram_id = ?",
        status_str,
        error,
        sent_at,
        broadcast_id,
        telegram_id
    )
    .execute(pool)
    .await?;

    // Обновляем сводку рассылки после изменения статуса сообщения
    update_broadcast_summary_from_messages(pool, broadcast_id).await?;

    Ok(())
}

pub async fn get_broadcast_messages(
    pool: &SqlitePool,
    broadcast_id: &str,
    status: Option<MessageStatus>,
    limit: Option<i32>,
    offset: Option<i32>,
) -> Result<Vec<BroadcastMessageRecord>, sqlx::Error> {
    let limit = limit.unwrap_or(DEFAULT_QUERY_LIMIT);
    let offset = offset.unwrap_or(DEFAULT_QUERY_OFFSET);
    

    
    let records = if let Some(status) = &status {
        let status_str = status.to_string();
        
        sqlx::query!(
            "SELECT id, broadcast_id, telegram_id, status, error, sent_at, retry_count, message_type, created_at 
             FROM broadcast_messages 
             WHERE broadcast_id = ? AND status = ?
             ORDER BY created_at ASC
             LIMIT ? OFFSET ?",
            broadcast_id,
            status_str,
            limit,
            offset
        )
        .fetch_all(pool)
        .await?
        .into_iter()
        .map(|row| BroadcastMessageRecord {
            id: row.id.unwrap_or(0),
            broadcast_id: row.broadcast_id,
            telegram_id: row.telegram_id,
            status: MessageStatus::from(row.status),
            error: row.error,
            sent_at: row.sent_at,
            retry_count: row.retry_count,
            message_type: row.message_type.as_ref().map(|mt| match mt.as_str() {
                "custom" => BroadcastMessageType::Custom,
                "signup" => BroadcastMessageType::SignUp,
                _ => BroadcastMessageType::Custom,
            }),
            created_at: row.created_at,
        })
        .collect()
    } else {
        sqlx::query!(
            "SELECT id, broadcast_id, telegram_id, status, error, sent_at, retry_count, message_type, created_at 
             FROM broadcast_messages 
             WHERE broadcast_id = ?
             ORDER BY created_at ASC
             LIMIT ? OFFSET ?",
            broadcast_id,
            limit,
            offset
        )
        .fetch_all(pool)
        .await?
        .into_iter()
        .map(|row| BroadcastMessageRecord {
            id: row.id.unwrap_or(0),
            broadcast_id: row.broadcast_id,
            telegram_id: row.telegram_id,
            status: MessageStatus::from(row.status),
            error: row.error,
            sent_at: row.sent_at,
            retry_count: row.retry_count,
            message_type: row.message_type.as_ref().map(|mt| match mt.as_str() {
                "custom" => BroadcastMessageType::Custom,
                "signup" => BroadcastMessageType::SignUp,
                _ => BroadcastMessageType::Custom,
            }),
            created_at: row.created_at,
        })
        .collect()
    };

    Ok(records)
}

// Command Handlers

pub async fn handle_create_broadcast(
    pool: &SqlitePool,
    command: CreateBroadcastCommand,
) -> Result<(BroadcastCreatedResponse, BroadcastEvent), Box<dyn std::error::Error>> {
    let broadcast_id = uuid::Uuid::new_v4().to_string();
    
    // Работаем только с внешними пользователями
    let mut users = Vec::new();
    
    // Работаем только с внешними пользователями
    if let Some(selected_external_user_ids) = &command.selected_external_users {
        // Внешние пользователи - это telegram_id
        println!("Внешние пользователи выбраны: {:?}", selected_external_user_ids);
        
        // Создаем пользователей только с telegram_id
        let external_users = selected_external_user_ids.iter().map(|telegram_id| {
            let user = User {
                telegram_id: telegram_id.parse::<i64>().unwrap_or(0),
                name: format!("User {}", telegram_id),
                telegram_nickname: None,
                phone_number: None,
                full_name: None,
            };
            println!("Создан пользователь: telegram_id={}", user.telegram_id);
            user
        }).collect::<Vec<_>>();
        
        users.extend(external_users);
    } else {
        println!("ОШИБКА: selected_external_users должен быть указан!");
        return Err("No external users specified".into());
    }
    
    // Создаем событие
    let event = BroadcastEvent::BroadcastCreated {
        broadcast_id: broadcast_id.clone(),
        message: command.message.clone(),
        target_users: users.clone(),
        message_type: command.message_type.clone(),
        media_group: command.media_group.clone(),
        created_at: chrono::Utc::now(),
    };
    
    // Сохраняем событие
    save_broadcast_event(pool, &event).await?;
    
    // Создаем read model
    let summary = BroadcastSummary {
        id: broadcast_id.clone(),
        message: command.message,
        total_users: users.len() as i64,
        sent_count: 0,
        failed_count: 0,
        pending_count: users.len() as i64,
        status: BroadcastStatus::Pending,
        created_at: chrono::Utc::now().naive_utc(),
        started_at: None,
        completed_at: None,
    };
    
    create_broadcast_summary(pool, &summary).await?;
    
    // Записи сообщений будут созданы воркером событий
    // чтобы избежать дублирования
    
    Ok((BroadcastCreatedResponse {
        broadcast_id,
        status: BroadcastStatus::Pending,
    }, event))
}

pub async fn handle_retry_message(
    pool: &SqlitePool,
    command: RetryMessageCommand,
) -> Result<(), Box<dyn std::error::Error>> {
    // Получаем сообщение
    let messages = get_broadcast_messages(pool, &command.broadcast_id, Some(MessageStatus::Failed), Some(1), Some(0)).await?;
    
    if let Some(mut message) = messages.into_iter().next() {
        message.status = MessageStatus::Retrying;
        message.retry_count += 1;
        
        update_broadcast_message(pool, &message).await?;
        
        // Создаем событие повторной попытки
        let event = BroadcastEvent::MessageRetrying {
            broadcast_id: command.broadcast_id,
            telegram_id: command.telegram_id,
            retry_count: message.retry_count as u32,
            retry_at: chrono::Utc::now(),
        };
        
        save_broadcast_event(pool, &event).await?;
    }
    
    Ok(())
}

pub async fn handle_cancel_broadcast(
    pool: &SqlitePool,
    command: CancelBroadcastCommand,
) -> Result<(), Box<dyn std::error::Error>> {
    // Обновляем статус в read model
    if let Some(mut summary) = get_broadcast_summary(pool, &command.broadcast_id).await? {
        summary.status = BroadcastStatus::Failed;
        summary.completed_at = Some(chrono::Utc::now().naive_utc());
        
        update_broadcast_summary(pool, &summary).await?;
    }
    
    Ok(())
}

// Query Handlers

pub async fn handle_get_broadcast_status(
    pool: &SqlitePool,
    query: GetBroadcastStatusQuery,
) -> Result<Option<BroadcastStatusResponse>, Box<dyn std::error::Error>> {
    let summary = get_broadcast_summary(pool, &query.broadcast_id).await?;
    
    match summary {
        Some(broadcast) => {
            let messages = get_broadcast_messages(pool, &query.broadcast_id, None, Some(DEFAULT_QUERY_LIMIT), Some(DEFAULT_QUERY_OFFSET)).await?;
            
            Ok(Some(BroadcastStatusResponse {
                broadcast,
                messages,
            }))
        }
        None => Ok(None),
    }
}

pub async fn handle_get_broadcast_messages(
    pool: &SqlitePool,
    query: GetBroadcastMessagesQuery,
) -> Result<Vec<BroadcastMessageRecord>, Box<dyn std::error::Error>> {
    let messages = get_broadcast_messages(
        pool,
        &query.broadcast_id,
        query.status,
        query.limit,
        query.offset,
    ).await?;
    
    Ok(messages)
}

pub async fn delete_broadcast(
    pool: &SqlitePool,
    broadcast_id: &str,
) -> Result<(), Box<dyn std::error::Error>> {
    // Удаляем сообщения рассылки
    sqlx::query!(
        "DELETE FROM broadcast_messages WHERE broadcast_id = ?",
        broadcast_id
    )
    .execute(pool)
    .await?;

    // Удаляем события рассылки
    sqlx::query!(
        "DELETE FROM broadcast_events WHERE broadcast_id = ?",
        broadcast_id
    )
    .execute(pool)
    .await?;

    // Удаляем сводку рассылки
    sqlx::query!(
        "DELETE FROM broadcast_summaries WHERE id = ?",
        broadcast_id
    )
    .execute(pool)
    .await?;

    Ok(())
}

// Voting System Functions

/// Получает роль пользователя
pub async fn get_user_role(pool: &SqlitePool, telegram_id: i64) -> Result<Option<i32>, sqlx::Error> {
    let result = sqlx::query!(
        "SELECT role FROM user_roles WHERE telegram_id = ?",
        telegram_id
    )
    .fetch_optional(pool)
    .await?;
    
    Ok(result.map(|r| r.role as i32))
}

/// Создает или обновляет роль пользователя
pub async fn set_user_role(pool: &SqlitePool, telegram_id: i64, role: i32) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "INSERT OR REPLACE INTO user_roles (telegram_id, role, created_at) VALUES (?, ?, CURRENT_TIMESTAMP)",
        telegram_id,
        role
    )
    .execute(pool)
    .await?;
    
    Ok(())
}


/// Получает следующую анкету для обычного пользователя (атомарный захват)
pub async fn get_next_survey_for_regular_user(pool: &SqlitePool, voter_telegram_id: i64) -> Result<Option<i64>, sqlx::Error> {
    // Сначала находим подходящую анкету
    let survey_id = sqlx::query!(
        r#"
        SELECT s.survey_id
        FROM (
            SELECT DISTINCT survey_id, created_at FROM votes 
            ORDER BY created_at ASC
        ) s
        WHERE s.survey_id NOT IN (
            SELECT survey_id FROM votes WHERE voter_telegram_id = ?
        )
        AND (
            SELECT COUNT(*) FROM votes v 
            WHERE v.survey_id = s.survey_id
        ) < ?
        AND NOT EXISTS (
            SELECT 1 FROM votes v 
            JOIN user_roles ur ON v.voter_telegram_id = ur.telegram_id
            WHERE v.survey_id = s.survey_id AND ur.role = 1
        )
        ORDER BY s.created_at ASC
        LIMIT 1
        "#,
        voter_telegram_id,
        MIN_VOTES_FOR_REVIEW
    )
    .fetch_optional(pool)
    .await?;
    
    if let Some(survey) = survey_id {
        // Атомарно захватываем анкету, создавая временный голос "В обработке"
        let result = sqlx::query!(
            "INSERT INTO votes (survey_id, voter_telegram_id, decision, comment) VALUES (?, ?, 0, 'В обработке')",
            survey.survey_id,
            voter_telegram_id
        )
        .execute(pool)
        .await;
        
        match result {
            Ok(_) => Ok(Some(survey.survey_id)),
            Err(sqlx::Error::Database(db_err)) if db_err.is_unique_violation() => {
                // Другой пользователь уже захватил эту анкету
                Ok(None)
            }
            Err(e) => Err(e),
        }
    } else {
        Ok(None)
    }
}

/// Получает следующую анкету для ответственного пользователя (атомарный захват)
pub async fn get_next_survey_for_responsible_user(pool: &SqlitePool, voter_telegram_id: i64) -> Result<Option<i64>, sqlx::Error> {
    // Сначала находим анкету, готовую для проверки
    let survey_id = sqlx::query!(
        r#"
        SELECT s.survey_id
        FROM (
            SELECT DISTINCT survey_id, created_at FROM votes 
            ORDER BY created_at ASC
        ) s
        WHERE (
            SELECT COUNT(*) FROM votes v 
            WHERE v.survey_id = s.survey_id
        ) >= ?
        AND NOT EXISTS (
            SELECT 1 FROM votes v 
            JOIN user_roles ur ON v.voter_telegram_id = ur.telegram_id
            WHERE v.survey_id = s.survey_id AND ur.role = 1
        )
        ORDER BY s.created_at ASC
        LIMIT 1
        "#,
        MIN_VOTES_FOR_REVIEW
    )
    .fetch_optional(pool)
    .await?;
    
    if let Some(survey) = survey_id {
        // Атомарно захватываем анкету
        let result = sqlx::query!(
            "INSERT INTO votes (survey_id, voter_telegram_id, decision, comment) VALUES (?, ?, 0, 'В обработке')",
            survey.survey_id,
            voter_telegram_id
        )
        .execute(pool)
        .await;
        
        match result {
            Ok(_) => Ok(Some(survey.survey_id)),
            Err(sqlx::Error::Database(db_err)) if db_err.is_unique_violation() => {
                // Другой ответственный уже захватил эту анкету
                Ok(None)
            }
            Err(e) => Err(e),
        }
    } else {
        Ok(None)
    }
}

/// Создает голос (или обновляет запись "В обработке")
pub async fn create_vote(pool: &SqlitePool, request: CreateVoteRequest, voter_telegram_id: i64) -> Result<Vote, sqlx::Error> {
    // Проверяем, есть ли уже запись "В обработке" для этого пользователя и анкеты
    let existing_processing_vote = sqlx::query_as::<_, (i64,)>(
        "SELECT id FROM votes WHERE survey_id = ? AND voter_telegram_id = ? AND comment = 'В обработке'"
    )
    .bind(request.survey_id)
    .bind(voter_telegram_id)
    .fetch_optional(pool)
    .await?;
    
    let vote_id = if let Some(existing) = existing_processing_vote {
        // Обновляем существующую запись "В обработке"
        sqlx::query!(
            "UPDATE votes SET decision = ?, comment = ? WHERE id = ?",
            request.decision,
            request.comment,
            existing.0
        )
        .execute(pool)
        .await?;
        
        existing.0
    } else {
        // Создаем новую запись (если по какой-то причине записи "В обработке" нет)
        let result = sqlx::query!(
            "INSERT INTO votes (survey_id, voter_telegram_id, decision, comment) VALUES (?, ?, ?, ?)",
            request.survey_id,
            voter_telegram_id,
            request.decision,
            request.comment
        )
        .execute(pool)
        .await?;
        
        result.last_insert_rowid()
    };
    
    // Получаем обновленную запись
    let vote = sqlx::query_as::<_, Vote>(
        "SELECT id, survey_id, voter_telegram_id, decision, comment, created_at FROM votes WHERE id = ?"
    )
    .bind(vote_id)
    .fetch_one(pool)
    .await?;
    
    Ok(vote)
}

/// Получает голоса для анкеты
pub async fn get_votes_by_survey(pool: &SqlitePool, survey_id: i64) -> Result<Vec<Vote>, sqlx::Error> {
    let votes = sqlx::query_as::<_, Vote>(
        "SELECT id, survey_id, voter_telegram_id, decision, comment, created_at FROM votes WHERE survey_id = ? ORDER BY created_at ASC"
    )
    .bind(survey_id)
    .fetch_all(pool)
    .await?;
    
    Ok(votes)
}

/// Получает статистику голосов для анкеты
pub async fn get_survey_vote_summary(pool: &SqlitePool, survey_id: i64) -> Result<SurveyVoteSummary, sqlx::Error> {
    // Получаем общую статистику голосов (исключая служебные записи)
    let stats = sqlx::query!(
        r#"
        SELECT 
            decision,
            COUNT(*) as "count: i64"
        FROM votes 
        WHERE survey_id = ? 
        AND (comment IS NULL OR (comment != 'В обработке' AND comment != 'Инициализация'))
        GROUP BY decision
        "#,
        survey_id
    )
    .fetch_all(pool)
    .await?;
    
    let mut approve_votes = 0;
    let mut reject_votes = 0;
    
    for stat in stats {
        if stat.decision == 1 {
            approve_votes = stat.count.unwrap_or(0);
        } else {
            reject_votes = stat.count.unwrap_or(0);
        }
    }
    
    let total_votes = approve_votes + reject_votes;
    
    // Проверяем, есть ли голос от ответственного
    let has_responsible_vote = sqlx::query!(
        r#"
        SELECT 1 as "exists: i32" FROM votes v 
        JOIN user_roles ur ON v.voter_telegram_id = ur.telegram_id
        WHERE v.survey_id = ? AND ur.role = 1
        "#,
        survey_id
    )
    .fetch_optional(pool)
    .await?
    .is_some();
    
    // Определяем статус
    let status = if has_responsible_vote {
        SurveyStatus::Completed
    } else if total_votes >= MIN_VOTES_FOR_REVIEW {
        SurveyStatus::ReadyForReview
    } else {
        SurveyStatus::InProgress
    };
    
    Ok(SurveyVoteSummary {
        survey_id,
        total_votes,
        approve_votes,
        reject_votes,
        status,
        has_responsible_vote,
    })
}

/// Получает данные анкеты пользователя с внешнего API
pub async fn get_user_survey_data(_pool: &SqlitePool, survey_id: i64) -> Result<Option<UserSurvey>, sqlx::Error> {
    // Получаем URL внешнего API из переменных окружения
    let api_base_url = std::env::var("EXTERNAL_API_URL")
        .unwrap_or_else(|_| "http://localhost:3001".to_string());
    
    let survey_url = format!("{}/api/users/{}/survey", api_base_url, survey_id);
    
    // Делаем запрос к внешнему API
    let client = reqwest::Client::new();
    match client
        .get(&survey_url)
        .header("X-Forwarded-For", "127.0.0.1")
        .send()
        .await {
        Ok(response) => {
            if response.status().is_success() {
                match response.json::<UserSurvey>().await {
                    Ok(survey_data) => Ok(Some(survey_data)),
                    Err(e) => {
                        eprintln!("Ошибка парсинга JSON анкеты {}: {}", survey_id, e);
                        Ok(None)
                    }
                }
            } else {
                eprintln!("Ошибка получения анкеты {}: HTTP {}", survey_id, response.status());
                Ok(None)
            }
        }
        Err(e) => {
            eprintln!("Ошибка запроса к внешнему API для анкеты {}: {}", survey_id, e);
            Ok(None)
        }
    }
}

/// Получает список пользователей с внешнего API и сохраняет их в базе данных
pub async fn sync_users_from_external_api(pool: &SqlitePool) -> Result<Vec<i64>, Box<dyn std::error::Error>> {
    let api_base_url = std::env::var("EXTERNAL_API_URL")
        .unwrap_or_else(|_| "http://localhost:3001".to_string());
    
    let users_url = format!("{}/api/users/completed", api_base_url);
    
    // Делаем запрос к внешнему API для получения списка пользователей
    let client = reqwest::Client::new();
    let response = client
        .get(&users_url)
        .header("X-Forwarded-For", "127.0.0.1")
        .send()
        .await?;
    
    if !response.status().is_success() {
        return Err(format!("Ошибка получения пользователей: HTTP {}", response.status()).into());
    }
    
    let users: Vec<serde_json::Value> = response.json().await?;
    let mut synced_user_ids = Vec::new();
    
    for user in users {
        if let Some(telegram_id) = user.get("telegram_id").and_then(|v| v.as_i64()) {
            // Проверяем, есть ли уже голос за этого пользователя
            let existing_vote = sqlx::query!(
                "SELECT 1 as \"exists: i32\" FROM votes WHERE survey_id = ? LIMIT 1",
                telegram_id
            )
            .fetch_optional(pool)
            .await?;
            
            // Если голоса еще нет, создаем запись-заглушку для инициализации
            if existing_vote.is_none() {
                // Создаем временную запись для инициализации анкеты
                let _ = sqlx::query!(
                    "INSERT OR IGNORE INTO votes (survey_id, voter_telegram_id, decision, comment) VALUES (?, 0, -1, 'Инициализация')",
                    telegram_id
                )
                .execute(pool)
                .await;
                
                synced_user_ids.push(telegram_id);
            }
        }
    }
    
    Ok(synced_user_ids)
}

/// Получает следующую анкету для голосования
pub async fn get_next_survey(pool: &SqlitePool, voter_telegram_id: i64) -> Result<NextSurveyResponse, sqlx::Error> {
    
    // Получаем роль пользователя
    let user_role = get_user_role(pool, voter_telegram_id).await?.unwrap_or(0);
    
    // Получаем всех пользователей с внешнего API
    let all_users = match get_all_users_from_external_api().await {
        Ok(users) => {
            users
        },
        Err(e) => {
            tracing::error!("Ошибка получения пользователей с внешнего API: {}", e);
            return Ok(NextSurveyResponse {
                survey_id: None,
                survey_data: None,
                votes: None,
                user_role,
            });
        }
    };
    
    // Получаем голоса пользователя из БД
    let user_votes = sqlx::query!(
        "SELECT survey_id FROM votes WHERE voter_telegram_id = ?",
        voter_telegram_id
    )
    .fetch_all(pool)
    .await?;
    
    let voted_survey_ids: std::collections::HashSet<i64> = user_votes
        .into_iter()
        .map(|v| v.survey_id)
        .collect();
    
    
    // Проверяем, есть ли у пользователя активные записи "В обработке"
    let existing_processing = sqlx::query!(
        "SELECT COUNT(*) as count FROM votes WHERE voter_telegram_id = ? AND comment = 'В обработке'",
        voter_telegram_id
    )
    .fetch_one(pool)
    .await?;
    
    if existing_processing.count > 0 {
        let cleared = clear_user_locks(pool, voter_telegram_id).await?;
        println!("✅ Очищено {} записей 'В обработке'", cleared);
    }
    
    let next_survey_id = if user_role == 1 {
        // Ответственный пользователь - ищем анкеты с >= MIN_VOTES_FOR_REVIEW голосами, но без голоса ответственного
        println!("🔍 Ищем анкету для ответственного пользователя");
        find_survey_for_responsible_user(pool, &all_users, &voted_survey_ids).await?
    } else {
        // Обычный пользователь - ищем анкеты с приоритизацией (ближе к MIN_VOTES_FOR_REVIEW голосам)
        println!("🔍 Ищем анкету для обычного пользователя");
        find_survey_for_regular_user(pool, &all_users, &voted_survey_ids).await?
    };
    
    println!("📋 Найденная анкета: {:?}", next_survey_id);
    
    if let Some(survey_id) = next_survey_id {
        // Сначала очищаем все существующие записи "В обработке" этого пользователя
        println!("🧹 Очищаем старые записи 'В обработке' для пользователя {}", voter_telegram_id);
        let cleared_count = clear_user_locks(pool, voter_telegram_id).await?;
        if cleared_count > 0 {
            println!("✅ Очищено {} старых записей 'В обработке'", cleared_count);
        }
        
        // Создаем новую запись "В обработке" для блокировки анкеты
        println!("🔒 Создаем запись 'В обработке' для анкеты {} пользователя {}", survey_id, voter_telegram_id);
        let lock_result = sqlx::query!(
            "INSERT INTO votes (survey_id, voter_telegram_id, decision, comment) VALUES (?, ?, 0, 'В обработке')",
            survey_id,
            voter_telegram_id
        )
        .execute(pool)
        .await;
        
        match lock_result {
            Ok(_) => {
                println!("✅ Запись 'В обработке' создана для анкеты {}", survey_id);
            },
            Err(sqlx::Error::Database(db_err)) if db_err.is_unique_violation() => {
                println!("❌ Анкета {} уже захвачена другим пользователем", survey_id);
                // Анкета уже захвачена, возвращаем пустой ответ
                return Ok(NextSurveyResponse {
                    survey_id: None,
                    survey_data: None,
                    votes: None,
                    user_role,
                });
            },
            Err(e) => {
                println!("❌ Ошибка создания записи 'В обработке': {}", e);
                return Err(e);
            }
        }
        
        println!("📋 Получаем данные анкеты {} с внешнего API...", survey_id);
        // Получаем анкету с внешнего API
        let survey_data = match get_user_survey_from_external_api(survey_id).await {
            Ok(data) => {
                println!("✅ Получены данные анкеты с внешнего API");
                data
            },
            Err(e) => {
                println!("❌ Ошибка получения анкеты с внешнего API: {}", e);
                tracing::error!("Ошибка получения анкеты с внешнего API: {}", e);
                None
            }
        };
        
        println!("📊 Получаем голоса для анкеты {}...", survey_id);
        // Получаем голоса
        let votes = get_votes_by_survey(pool, survey_id).await?;
        println!("✅ Получено {} голосов", votes.len());
        
        Ok(NextSurveyResponse {
            survey_id: Some(survey_id),
            survey_data,
            votes: Some(votes),
            user_role,
        })
    } else {
        println!("❌ Анкета не найдена, возвращаем null");
        Ok(NextSurveyResponse {
            survey_id: None,
            survey_data: None,
            votes: None,
            user_role,
        })
    }
}

/// Находит анкету для обычного пользователя с приоритизацией
async fn find_survey_for_regular_user(
    pool: &SqlitePool,
    all_users: &[serde_json::Value],
    voted_survey_ids: &std::collections::HashSet<i64>,
) -> Result<Option<i64>, sqlx::Error> {
    println!("🔍 find_survey_for_regular_user: {} пользователей, {} уже проголосовано", 
             all_users.len(), voted_survey_ids.len());
    
    // Извлекаем telegram_id из всех пользователей
    let user_telegram_ids: Vec<i64> = all_users
        .iter()
        .filter_map(|user| user.get("telegram_id").and_then(|v| v.as_i64()))
        .filter(|&id| !voted_survey_ids.contains(&id))
        .collect();
    
    if user_telegram_ids.is_empty() {
        println!("❌ Нет доступных пользователей для голосования");
        return Ok(None);
    }
    
    // Получаем количество голосов для всех кандидатов одним запросом
    // Считаем только реальные голоса (не "В обработке") + проверяем есть ли голоса "В обработке"
    let placeholders = user_telegram_ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
    let query = format!(
        "SELECT survey_id, 
         COUNT(*) as total_count,
         COUNT(CASE WHEN comment IS NULL OR (comment != 'В обработке' AND comment != 'Инициализация') THEN 1 END) as real_count,
         COUNT(CASE WHEN comment = 'В обработке' THEN 1 END) as processing_count
         FROM votes WHERE survey_id IN ({}) GROUP BY survey_id",
        placeholders
    );
    
    let mut query_builder = sqlx::query_as::<_, (i64, i64, i64, i64)>(&query);
    for telegram_id in &user_telegram_ids {
        query_builder = query_builder.bind(telegram_id);
    }
    
    let vote_data: std::collections::HashMap<i64, (i64, i64, i64)> = query_builder
        .fetch_all(pool)
        .await?
        .into_iter()
        .map(|(survey_id, total, real, processing)| (survey_id, (total, real, processing)))
        .collect();
    
    // Создаем список кандидатов с количеством голосов
    let mut candidates = Vec::new();
    
    for telegram_id in user_telegram_ids {
        let (_total_count, real_count, processing_count) = vote_data.get(&telegram_id).copied().unwrap_or((0, 0, 0));
        
        // Анкета доступна обычным пользователям если:
        // 1. Реальных голосов меньше MIN_VOTES_FOR_REVIEW
        // 2. И нет активных голосов "В обработке" (чтобы избежать конфликтов)
        if real_count < MIN_VOTES_FOR_REVIEW && processing_count == 0 {
            candidates.push((telegram_id, real_count));
        }
    }
    
    // Сортируем по приоритету: ближе к MIN_VOTES_FOR_REVIEW голосам = выше приоритет
    candidates.sort_by(|a, b| {
        let distance_a = (MIN_VOTES_FOR_REVIEW - a.1).abs();
        let distance_b = (MIN_VOTES_FOR_REVIEW - b.1).abs();
        distance_a.cmp(&distance_b)
    });
    
    // Возвращаем пользователя с наивысшим приоритетом
    let result = candidates.first().map(|(telegram_id, _)| *telegram_id);
    println!("🎯 find_survey_for_regular_user: найдено {} кандидатов, выбран: {:?}", 
             candidates.len(), result);
    Ok(result)
}

/// Находит анкету для ответственного пользователя
async fn find_survey_for_responsible_user(
    pool: &SqlitePool,
    all_users: &[serde_json::Value],
    _voted_survey_ids: &std::collections::HashSet<i64>,
) -> Result<Option<i64>, sqlx::Error> {
    println!("🔍 find_survey_for_responsible_user: проверяем {} пользователей", all_users.len());
    
    // Проверим, сколько анкет уже обработано ответственными
    let responsible_processed = sqlx::query!(
        "SELECT COUNT(DISTINCT survey_id) as count FROM votes v 
         JOIN user_roles ur ON v.voter_telegram_id = ur.telegram_id 
         WHERE ur.role = 1"
    )
    .fetch_one(pool)
    .await?;
    
    println!("📊 Ответственные пользователи уже обработали {} анкет", responsible_processed.count);
    
    // Покажем, кто является ответственным
    let responsible_users = sqlx::query!(
        "SELECT telegram_id FROM user_roles WHERE role = 1"
    )
    .fetch_all(pool)
    .await?;
    
    println!("👥 Ответственные пользователи: {:?}", 
             responsible_users.iter().map(|r| r.telegram_id).collect::<Vec<_>>());
    
    // Извлекаем telegram_id из всех пользователей
    let user_telegram_ids: Vec<i64> = all_users
        .iter()
        .filter_map(|user| user.get("telegram_id").and_then(|v| v.as_i64()))
        .collect();
    
    if user_telegram_ids.is_empty() {
        println!("❌ Нет доступных пользователей");
        return Ok(None);
    }
    
    // Получаем количество голосов для всех кандидатов одним запросом
    let placeholders = user_telegram_ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
    let vote_query = format!(
        "SELECT survey_id, COUNT(*) as count FROM votes WHERE survey_id IN ({}) GROUP BY survey_id",
        placeholders
    );
    
    let mut vote_query_builder = sqlx::query_as::<_, (i64, i64)>(&vote_query);
    for telegram_id in &user_telegram_ids {
        vote_query_builder = vote_query_builder.bind(telegram_id);
    }
    
    let vote_counts: std::collections::HashMap<i64, i64> = vote_query_builder
        .fetch_all(pool)
        .await?
        .into_iter()
        .collect();
    
    // Получаем голоса ответственных для всех кандидатов одним запросом
    let responsible_vote_query = format!(
        "SELECT v.survey_id FROM votes v 
         JOIN user_roles ur ON v.voter_telegram_id = ur.telegram_id 
         WHERE v.survey_id IN ({}) AND ur.role = 1",
        placeholders
    );
    
    let mut responsible_query_builder = sqlx::query_as::<_, (i64,)>(&responsible_vote_query);
    for telegram_id in &user_telegram_ids {
        responsible_query_builder = responsible_query_builder.bind(telegram_id);
    }
    
    let responsible_votes: std::collections::HashSet<i64> = responsible_query_builder
        .fetch_all(pool)
        .await?
        .into_iter()
        .map(|(survey_id,)| survey_id)
        .collect();
    
    // Ищем первую подходящую анкету
    for telegram_id in user_telegram_ids {
        let vote_count = vote_counts.get(&telegram_id).copied().unwrap_or(0);
        
        println!("🔍 Анкета {}: {} голосов (требуется >= {})", telegram_id, vote_count, MIN_VOTES_FOR_REVIEW);
        
        if vote_count >= MIN_VOTES_FOR_REVIEW {
            let has_responsible_vote = responsible_votes.contains(&telegram_id);
            println!("🔍 Анкета {}: есть голос от ответственного: {}", telegram_id, has_responsible_vote);
            
            if !has_responsible_vote {
                println!("✅ find_survey_for_responsible_user: найдена анкета {} с {} голосами", 
                         telegram_id, vote_count);
                return Ok(Some(telegram_id));
            } else {
                println!("❌ Анкета {} уже имеет голос от ответственного", telegram_id);
            }
        } else {
            println!("❌ Анкета {} имеет недостаточно голосов: {} < {}", telegram_id, vote_count, MIN_VOTES_FOR_REVIEW);
        }
    }
    println!("❌ find_survey_for_responsible_user: не найдено подходящих анкет");
    Ok(None)
}

/// Обрабатывает голосование
pub async fn handle_vote(pool: &SqlitePool, request: CreateVoteRequest, voter_telegram_id: i64) -> Result<VoteResponse, sqlx::Error> {
    // Создаем голос
    let _vote = create_vote(pool, request.clone(), voter_telegram_id).await?;
    
    // Получаем следующую анкету
    let next_survey = get_next_survey(pool, voter_telegram_id).await?;
    
    Ok(VoteResponse {
        success: true,
        message: "Голос успешно сохранен".to_string(),
        next_survey: Some(next_survey),
    })
}

// Authentication Functions

/// Проверяет авторизацию через Telegram и получает профиль пользователя
pub async fn authenticate_user(telegram_auth: TelegramAuth) -> Result<AuthResponse, String> {
    // TODO: Добавить проверку подписи Telegram (hash verification)
    // Пока что просто проверяем, что данные пришли
    
    let api_base_url = std::env::var("USER_API_URL")
        .unwrap_or_else(|_| "https://api.ingroupsts.ru".to_string());
        
    
    let user_url = format!("{}/user/{}", api_base_url, telegram_auth.id);
    
    println!("🔍 Попытка авторизации пользователя ID: {}", telegram_auth.id);
    println!("🌐 URL запроса: {}", user_url);
    
    // Делаем запрос к внешнему API для получения профиля пользователя
    let client = reqwest::Client::new();
    match client
        .get(&user_url)
        .header("X-Forwarded-For", "127.0.0.1")
        .send()
        .await {
        Ok(response) => {
            if response.status().is_success() {
                match response.json::<ExternalUserResponse>().await {
                    Ok(user_data) => {
                        // Пользователь найден в системе
                        println!("✅ Пользователь {} успешно авторизован", telegram_auth.id);
                        Ok(AuthResponse {
                            success: true,
                            message: "Авторизация успешна".to_string(),
                            user_profile: Some(user_data.user_profile),
                            user_role: None, // Будет получена из БД
                        })
                    }
                    Err(e) => {
                        eprintln!("❌ Ошибка парсинга профиля пользователя {}: {}", telegram_auth.id, e);
                        Ok(AuthResponse {
                            success: false,
                            message: "Ошибка получения данных пользователя".to_string(),
                            user_profile: None,
                            user_role: None,
                        })
                    }
                }
            } else {
                // Пользователь не найден в системе
                println!("❌ Пользователь {} не найден в системе (статус: {})", telegram_auth.id, response.status());
                Ok(AuthResponse {
                    success: false,
                    message: "Пользователь не найден в системе".to_string(),
                    user_profile: None,
                    user_role: None,
                })
            }
        }
        Err(e) => {
            eprintln!("❌ Ошибка запроса к внешнему API для пользователя {}: {}", telegram_auth.id, e);
            Ok(AuthResponse {
                success: false,
                message: "Ошибка подключения к серверу".to_string(),
                user_profile: None,
                user_role: None,
            })
        }
    }
}

/// Получает роль пользователя из базы данных
pub async fn get_user_role_from_db(pool: &SqlitePool, telegram_id: i64) -> Result<Option<i32>, sqlx::Error> {
    get_user_role(pool, telegram_id).await
}

/// Обновляет голос
pub async fn update_vote(pool: &SqlitePool, vote_id: i64, vote: UpdateVoteRequest) -> Result<Vote, sqlx::Error> {
    sqlx::query!(
        "UPDATE votes SET decision = ?, comment = ? WHERE id = ?",
        vote.decision,
        vote.comment,
        vote_id
    )
    .execute(pool)
    .await?;
    
    let updated_vote = sqlx::query_as::<_, Vote>(
        "SELECT id, survey_id, voter_telegram_id, decision, comment, created_at FROM votes WHERE id = ?"
    )
    .bind(vote_id)
    .fetch_one(pool)
    .await?;
    
    Ok(updated_vote)
}

/// Удаляет голос
pub async fn delete_vote(pool: &SqlitePool, vote_id: i64) -> Result<(), sqlx::Error> {
    sqlx::query!("DELETE FROM votes WHERE id = ?", vote_id)
        .execute(pool)
        .await?;
    
    Ok(())
}

/// Очищает блокировки пользователя (удаляет голоса со статусом "В обработке")
pub async fn clear_user_locks(pool: &SqlitePool, telegram_id: i64) -> Result<u64, sqlx::Error> {
    let result = sqlx::query!(
        "DELETE FROM votes WHERE voter_telegram_id = ? AND comment = ?",
        telegram_id,
        "В обработке"
    )
    .execute(pool)
    .await?;
    
    Ok(result.rows_affected())
}

/// Получает пользователей с отобранными анкетами (одобренными ответственными)
pub async fn get_selected_users(pool: &SqlitePool) -> Result<Vec<serde_json::Value>, sqlx::Error> {
    // Получаем всех пользователей с внешнего API
    let all_users = get_all_users_from_external_api().await
        .map_err(|e| sqlx::Error::Protocol(format!("External API error: {}", e)))?;
    
    // Получаем анкеты с положительными голосами от ответственных
    let selected_surveys = sqlx::query!(
        r#"
        SELECT DISTINCT v.survey_id
        FROM votes v
        JOIN user_roles ur ON v.voter_telegram_id = ur.telegram_id
        WHERE ur.role = 1 AND v.decision = 1
        "#
    )
    .fetch_all(pool)
    .await?;
    
    let selected_survey_ids: std::collections::HashSet<i64> = selected_surveys
        .into_iter()
        .map(|s| s.survey_id)
        .collect();
    
    // Фильтруем пользователей, оставляя только тех, чьи анкеты одобрены
    let selected_users: Vec<serde_json::Value> = all_users
        .into_iter()
        .filter(|user| {
            if let Some(telegram_id) = user.get("telegram_id").and_then(|v| v.as_i64()) {
                selected_survey_ids.contains(&telegram_id)
            } else {
                false
            }
        })
        .collect();
    
    Ok(selected_users)
}

/// Получает пользователей, которые не выполнили запись после рассылки о записи
pub async fn get_no_response_users(pool: &SqlitePool) -> Result<Vec<serde_json::Value>, sqlx::Error> {
    // Получаем всех пользователей с внешнего API
    let all_users = get_all_users_from_external_api().await
        .map_err(|e| sqlx::Error::Protocol(format!("External API error: {}", e)))?;
    
    // Получаем пользователей, которым была отправлена рассылка о записи (signup)
    // Включаем как успешно отправленные, так и неудачные сообщения
    let signup_recipients = sqlx::query!(
        r#"
        SELECT DISTINCT telegram_id
        FROM broadcast_messages bm
        JOIN broadcast_summaries bs ON bm.broadcast_id = bs.id
        WHERE bm.message_type = 'signup' 
        AND bs.status IN ('completed', 'in_progress')
        AND bm.status IN ('sent', 'failed')
        "#
    )
    .fetch_all(pool)
    .await?;
    
    let signup_telegram_ids: std::collections::HashSet<i64> = signup_recipients
        .into_iter()
        .map(|r| r.telegram_id)
        .collect();
    
    // Получаем пользователей, которые уже записались на слоты
    let booked_users = sqlx::query!(
        r#"
        SELECT DISTINCT telegram_id
        FROM records
        "#
    )
    .fetch_all(pool)
    .await?;
    
    let booked_telegram_ids: std::collections::HashSet<i64> = booked_users
        .into_iter()
        .map(|r| r.telegram_id)
        .collect();
    
    // Фильтруем пользователей: получили рассылку о записи, но не записались
    let no_response_users: Vec<serde_json::Value> = all_users
        .into_iter()
        .filter(|user| {
            if let Some(telegram_id) = user.get("telegram_id").and_then(|v| v.as_i64()) {
                // Получил рассылку о записи И не записался
                signup_telegram_ids.contains(&telegram_id) && !booked_telegram_ids.contains(&telegram_id)
            } else {
                false
            }
        })
        .collect();
    
    Ok(no_response_users)
}

/// Получает детальную информацию о пользователях без записи с информацией о статусе сообщений
pub async fn get_no_response_users_detailed(pool: &SqlitePool) -> Result<Vec<serde_json::Value>, sqlx::Error> {
    // Получаем пользователей, которые получили рассылку о записи, но не записались
    let no_response_users = sqlx::query!(
        r#"
        SELECT DISTINCT 
            bm.telegram_id,
            bm.status as message_status,
            bm.error,
            bm.sent_at,
            bm.retry_count,
            bs.created_at as broadcast_created_at
        FROM broadcast_messages bm
        JOIN broadcast_summaries bs ON bm.broadcast_id = bs.id
        WHERE bm.message_type = 'signup' 
        AND bs.status IN ('completed', 'in_progress', 'pending')
        AND bm.status IN ('sent', 'failed')
        AND bm.telegram_id NOT IN (
            SELECT DISTINCT telegram_id 
            FROM records
        )
        "#
    )
    .fetch_all(pool)
    .await?;
    
    println!("🔍 DEBUG: Found {} no-response users", no_response_users.len());
    
    // Преобразуем в JSON формат
    let result: Vec<serde_json::Value> = no_response_users
        .into_iter()
        .map(|user| {
            serde_json::json!({
                "telegram_id": user.telegram_id,
                "message_info": {
                    "status": user.message_status,
                    "error": user.error,
                    "sent_at": user.sent_at,
                    "retry_count": user.retry_count,
                    "broadcast_created_at": user.broadcast_created_at
                }
            })
        })
        .collect();
    
    Ok(result)
}

/// Обновляет статус сообщения рассылки
pub async fn update_broadcast_message_status_new(
    pool: &SqlitePool,
    telegram_id: i64,
    message_type: &str,
    new_status: &str
) -> Result<u64, sqlx::Error> {
    let result = sqlx::query!(
        r#"
        UPDATE broadcast_messages 
        SET status = $1
        WHERE telegram_id = $2 AND message_type = $3
        "#,
        new_status,
        telegram_id,
        message_type
    )
    .execute(pool)
    .await?;
    
    Ok(result.rows_affected())
}
