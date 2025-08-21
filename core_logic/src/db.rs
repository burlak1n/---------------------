use sqlx::{SqlitePool, Sqlite, migrate::MigrateDatabase};
use chrono::Utc;
use std::env;
use crate::{
    Slot, User, Record, Booking, CreateSlotRequest, CreateUserRequest, CreateBookingRequest,
    UpdateSlotRequest, UpdateUserRequest, BookingError, BookingInfo,
    // Event-Driven imports
    BroadcastEvent, BroadcastEventRecord, BroadcastSummary, BroadcastStatus, BroadcastMessageRecord, MessageStatus, BroadcastMessageType,
    CreateBroadcastCommand, BroadcastCreatedResponse, RetryMessageCommand, CancelBroadcastCommand,
    GetBroadcastStatusQuery, GetBroadcastMessagesQuery, BroadcastStatusResponse,
};

// Константы для магических чисел
const DEFAULT_QUERY_LIMIT: i32 = 100;
const DEFAULT_QUERY_OFFSET: i32 = 0;
const DEFAULT_BROADCAST_SUMMARIES_LIMIT: i32 = 50;
const DEFAULT_BROADCAST_SUMMARIES_OFFSET: i32 = 0;

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

pub async fn create_or_update_booking(pool: &SqlitePool, user_id: i64, slot_id: Option<i64>) -> Result<(), BookingError> {
    // Сначала удаляем существующую запись пользователя
    sqlx::query("DELETE FROM records WHERE user_id = ?")
        .bind(user_id)
        .execute(pool)
        .await?;
    
    // Затем создаем новую запись
    if let Some(slot_id) = slot_id {
        // Проверяем лимит и создаем запись в одной транзакции
        let result = sqlx::query!(
            "INSERT INTO records (user_id, slot_id) 
             SELECT ?, ? 
             WHERE (SELECT COUNT(*) FROM records WHERE slot_id = ?) < (SELECT max_user FROM slots WHERE id = ?)",
            user_id, slot_id, slot_id, slot_id
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

    create_or_update_booking(pool, payload.user_id, Some(slot_id)).await?;

    Ok(Booking { slot_id: payload.slot_id, user_id: payload.user_id })
}

pub async fn get_users(pool: &SqlitePool) -> Result<Vec<User>, sqlx::Error> {
    sqlx::query_as::<_, User>("SELECT * FROM users")
        .fetch_all(pool)
        .await
}

pub async fn create_user(pool: &SqlitePool, payload: CreateUserRequest) -> Result<User, sqlx::Error> {
    let id = sqlx::query!(
        "INSERT INTO users (name, telegram_id) VALUES (?, ?)",
        payload.name,
        payload.telegram_id
    )
    .execute(pool)
    .await?
    .last_insert_rowid();

    Ok(User { id, name: payload.name, telegram_id: payload.telegram_id })
}

pub async fn get_user_by_telegram_id(pool: &SqlitePool, telegram_id: i64) -> Result<Option<User>, sqlx::Error> {
    sqlx::query_as::<_, User>("SELECT * FROM users WHERE telegram_id = ?")
        .bind(telegram_id)
        .fetch_optional(pool)
        .await
}

pub async fn get_todays_bookings(pool: &SqlitePool) -> Result<Vec<BookingInfo>, sqlx::Error> {
    let today = Utc::now().date_naive();
    sqlx::query_as::<_, BookingInfo>(
        "SELECT u.telegram_id, s.time, s.place FROM records r JOIN users u ON r.user_id = u.id JOIN slots s ON r.slot_id = s.id WHERE date(s.time) = date(?)"
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

pub async fn update_user(pool: &SqlitePool, user_id: i64, payload: UpdateUserRequest) -> Result<User, sqlx::Error> {
    let mut query = String::from("UPDATE users SET ");
    let mut conditions = Vec::new();
    let mut params: Vec<Box<dyn sqlx::Encode<'_, Sqlite> + Send + Sync>> = Vec::new();

    if let Some(name) = payload.name {
        conditions.push("name = ?");
        params.push(Box::new(name));
    }

    if let Some(telegram_id) = payload.telegram_id {
        conditions.push("telegram_id = ?");
        params.push(Box::new(telegram_id));
    }

    if conditions.is_empty() {
        return sqlx::query_as::<_, User>("SELECT * FROM users WHERE id = ?")
            .bind(user_id)
            .fetch_one(pool)
            .await;
    }

    query.push_str(&conditions.join(", "));
    query.push_str(" WHERE id = ?");
    params.push(Box::new(user_id));

    sqlx::query(&query)
        .execute(pool)
        .await?;

    sqlx::query_as::<_, User>("SELECT * FROM users WHERE id = ?")
        .bind(user_id)
        .fetch_one(pool)
        .await
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

pub async fn delete_user(pool: &SqlitePool, user_id: i64) -> Result<(), sqlx::Error> {
    // Сначала удаляем все записи пользователя
    sqlx::query("DELETE FROM records WHERE user_id = ?")
        .bind(user_id)
        .execute(pool)
        .await?;

    // Затем удаляем самого пользователя
    sqlx::query("DELETE FROM users WHERE id = ?")
        .bind(user_id)
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

pub async fn get_users_for_broadcast(pool: &SqlitePool, include_users_without_telegram: bool) -> Result<Vec<User>, sqlx::Error> {
    if include_users_without_telegram {
        sqlx::query_as::<_, User>("SELECT * FROM users")
            .fetch_all(pool)
            .await
    } else {
        sqlx::query_as::<_, User>("SELECT * FROM users WHERE telegram_id IS NOT NULL")
            .fetch_all(pool)
            .await
    }
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
        "INSERT INTO broadcast_events (event_id, broadcast_id, event_type, event_data, created_at) 
         VALUES (?, ?, ?, ?, ?)",
        event_id,
        broadcast_id,
        event_type,
        event_data,
        now
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
        event_id: row.event_id,
        broadcast_id: row.broadcast_id,
        event_type: row.event_type,
        event_data: row.event_data,
        created_at: row.created_at.unwrap_or_else(|| chrono::Utc::now().naive_utc()),
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
            sent_count: r.sent_count.unwrap_or(0),
            failed_count: r.failed_count.unwrap_or(0),
            pending_count: r.pending_count.unwrap_or(0),
            status: BroadcastStatus::from(r.status.unwrap_or_default()),
            created_at: r.created_at.unwrap_or_default(),
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
            sent_count: r.sent_count.unwrap_or(0),
            failed_count: r.failed_count.unwrap_or(0),
            pending_count: r.pending_count.unwrap_or(0),
            status: BroadcastStatus::from(r.status.unwrap_or_default()),
            created_at: r.created_at.unwrap_or_default(),
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
    sqlx::query!(
        "INSERT INTO broadcast_messages (broadcast_id, user_id, telegram_id, status, error, sent_at, retry_count, created_at) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        message.broadcast_id,
        message.user_id,
        message.telegram_id,
        status_str,
        message.error,
        message.sent_at,
        message.retry_count,
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
         WHERE broadcast_id = ? AND user_id = ?",
        status_str,
        message.error,
        message.sent_at,
        message.retry_count,
        message.broadcast_id,
        message.user_id
    )
    .execute(pool)
    .await?;

    Ok(())
}

pub async fn update_broadcast_message_status(
    pool: &SqlitePool,
    broadcast_id: &str,
    user_id: &i64,
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
         WHERE broadcast_id = ? AND user_id = ?",
        status_str,
        error,
        sent_at,
        broadcast_id,
        user_id
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
            "SELECT id, broadcast_id, user_id, telegram_id, status, error, sent_at, retry_count, created_at 
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
            user_id: row.user_id,
            telegram_id: row.telegram_id,
            status: MessageStatus::from(row.status),
            error: row.error,
            sent_at: row.sent_at,
            retry_count: row.retry_count.unwrap_or(0),
            message_type: None,
            created_at: row.created_at.unwrap_or_else(|| chrono::Utc::now().naive_utc()),
        })
        .collect()
    } else {
        sqlx::query!(
            "SELECT id, broadcast_id, user_id, telegram_id, status, error, sent_at, retry_count, created_at 
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
            user_id: row.user_id,
            telegram_id: row.telegram_id,
            status: MessageStatus::from(row.status),
            error: row.error,
            sent_at: row.sent_at,
            retry_count: row.retry_count.unwrap_or(0),
            message_type: None,
            created_at: row.created_at.unwrap_or_else(|| chrono::Utc::now().naive_utc()),
        })
        .collect()
    };

    Ok(records)
}

// Command Handlers

pub async fn handle_create_broadcast(
    pool: &SqlitePool,
    command: CreateBroadcastCommand,
) -> Result<BroadcastCreatedResponse, Box<dyn std::error::Error>> {
    let broadcast_id = uuid::Uuid::new_v4().to_string();
    
    // Получаем пользователей
    let users = if let Some(selected_user_ids) = &command.selected_users {
        // Если указаны конкретные пользователи, получаем всех и фильтруем
        let all_users = get_users_for_broadcast(pool, command.include_users_without_telegram).await?;
        all_users.into_iter()
            .filter(|user| selected_user_ids.contains(&user.id))
            .collect()
    } else {
        // Если пользователи не выбраны, получаем всех подходящих
        get_users_for_broadcast(pool, command.include_users_without_telegram).await?
    };
    
    // Создаем событие
    let event = BroadcastEvent::BroadcastCreated {
        broadcast_id: broadcast_id.clone(),
        message: command.message.clone(),
        target_users: users.clone(),
        message_type: command.message_type.clone(),
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
    
    Ok(BroadcastCreatedResponse {
        broadcast_id,
        status: BroadcastStatus::Pending,
    })
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
            user_id: command.user_id,
            telegram_id: message.telegram_id.unwrap_or(0),
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