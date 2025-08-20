use crate::{Slot, User, CreateSlotRequest, CreateBookingRequest, CreateUserRequest, Booking, BookingInfo};
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

pub async fn create_or_update_booking(pool: &SqlitePool, user_id: i64, slot_id: Option<i64>) -> Result<(), sqlx::Error> {
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
            return Err(sqlx::Error::RowNotFound);
        }
    }
    
    Ok(())
}



pub async fn create_slot(pool: &SqlitePool, payload: CreateSlotRequest) -> Result<Slot, sqlx::Error> {
    let time = payload.start_time.to_rfc3339();
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

pub async fn create_booking(pool: &SqlitePool, payload: CreateBookingRequest) -> Result<Booking, sqlx::Error> {
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
    let today = Utc::now().format("%Y-%m-%d").to_string();
    sqlx::query_as::<_, BookingInfo>(
        "SELECT u.telegram_id, s.time, s.place FROM records r JOIN users u ON r.user_id = u.id JOIN slots s ON r.slot_id = s.id WHERE date(s.time) = ?"
    )
    .bind(today)
    .fetch_all(pool)
    .await
}