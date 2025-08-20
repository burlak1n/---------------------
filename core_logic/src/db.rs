use crate::{Slot, User, CreateSlotRequest, CreateBookingRequest, CreateUserRequest, Booking, BookingInfo, BookingError, Record, UpdateSlotRequest, UpdateUserRequest, UpdateBookingRequest};
use sqlx::{migrate::MigrateDatabase, Sqlite, SqlitePool};
use std::env;
use chrono::Utc;

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
        "SELECT s.id, s.time, s.place, s.max_user 
         FROM slots s 
         WHERE (SELECT COUNT(*) FROM records r WHERE r.slot_id = s.id) < s.max_user"
    )
    .fetch_all(pool)
    .await
}

pub async fn get_slot(pool: &SqlitePool, slot_id: i64) -> Result<Option<Slot>, sqlx::Error> {
    sqlx::query_as::<_, Slot>("SELECT * FROM slots WHERE id = ?")
        .bind(slot_id)
        .fetch_optional(pool)
        .await
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
    let mut query = String::from("UPDATE slots SET ");
    let mut conditions = Vec::new();
    let mut params: Vec<Box<dyn sqlx::Encode<'_, Sqlite> + Send + Sync>> = Vec::new();

    if let Some(time) = payload.start_time {
        conditions.push("time = ?");
        params.push(Box::new(time));
    }

    if let Some(place) = payload.place {
        conditions.push("place = ?");
        params.push(Box::new(place));
    }

    if conditions.is_empty() {
        return get_slot(pool, slot_id).await.map(|s| s.unwrap());
    }

    query.push_str(&conditions.join(", "));
    query.push_str(" WHERE id = ?");
    params.push(Box::new(slot_id));

    sqlx::query(&query)
        .execute(pool)
        .await?;

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