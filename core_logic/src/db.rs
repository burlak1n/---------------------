use crate::{AllowedUser, Record, Slot, User, CreateSlotRequest, CreateBookingRequest, CreateUserRequest, Booking, BookingInfo};
use sqlx::{migrate::MigrateDatabase, Sqlite, SqlitePool};
use std::env;
use chrono::Utc;

pub async fn init_db() -> Result<SqlitePool, anyhow::Error> {
    let db_url = env::var("DATABASE_URL").expect("DATABASE_URL must be set");
    if !Sqlite::database_exists(&db_url).await.unwrap_or(false) {
        Sqlite::create_database(&db_url).await?;
    }

    let pool = SqlitePool::connect(&db_url).await?;
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS slots ( id INTEGER PRIMARY KEY AUTOINCREMENT, time TEXT NOT NULL, place TEXT NOT NULL, max_user INTEGER NOT NULL );",
    )
    .execute(&pool)
    .await?;

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS users ( id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, telegram_id INTEGER UNIQUE );",
    )
    .execute(&pool)
    .await?;

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS records ( id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, slot_id INTEGER, FOREIGN KEY (user_id) REFERENCES users(id), FOREIGN KEY (slot_id) REFERENCES slots(id) );",
    )
    .execute(&pool)
    .await?;

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS allowed_users ( user_id INTEGER PRIMARY KEY );",
    )
    .execute(&pool)
    .await?;

    Ok(pool)
}

pub async fn get_available_slots(pool: &SqlitePool) -> Result<Vec<Slot>, sqlx::Error> {
    sqlx::query_as::<_, Slot>(
        "SELECT s.id, s.time, s.place, s.max_user FROM slots s LEFT JOIN records r ON s.id = r.slot_id GROUP BY s.id HAVING COUNT(r.id) < s.max_user"
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
    sqlx::query("INSERT INTO records (user_id, slot_id) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET slot_id = excluded.slot_id")
        .bind(user_id)
        .bind(slot_id)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn get_allowed_users(pool: &SqlitePool) -> Result<Vec<AllowedUser>, sqlx::Error> {
    sqlx::query_as::<_, AllowedUser>("SELECT * FROM allowed_users")
        .fetch_all(pool)
        .await
}

/*
pub async fn create_slot(pool: &SqlitePool, payload: CreateSlotRequest) -> Result<Slot, sqlx::Error> {
    let time = payload.start_time.to_rfc3339();
    let place = payload.title;
    let max_user = 1;
    let id = sqlx::query!(
        "INSERT INTO slots (time, place, max_user) VALUES (?, ?, ?)",
        time, place, max_user
    )
    .execute(pool)
    .await?
    .last_insert_rowid();

    get_slot(pool, id).await.map(|s| s.unwrap())
}
*/

pub async fn create_booking(pool: &SqlitePool, payload: CreateBookingRequest) -> Result<Booking, sqlx::Error> {
    // For now, we'll find the user by name. In a real application, you'd likely have a more robust way of identifying users.
    let user = sqlx::query_as::<_, User>("SELECT * FROM users WHERE name = ?")
        .bind(&payload.user_name)
        .fetch_one(pool)
        .await?;

    let slot_id = payload.slot_id.parse::<i64>().unwrap();

    create_or_update_booking(pool, user.id, Some(slot_id)).await?;

    Ok(Booking { slot_id: payload.slot_id, user_name: payload.user_name })
}

pub async fn get_users(pool: &SqlitePool) -> Result<Vec<User>, sqlx::Error> {
    sqlx::query_as::<_, User>("SELECT * FROM users")
        .fetch_all(pool)
        .await
}

/*
pub async fn create_user(pool: &SqlitePool, payload: CreateUserRequest) -> Result<User, sqlx::Error> {
    let id = sqlx::query!(
        "INSERT INTO users (name, email, telegram_id) VALUES (?, ?, ?)",
        payload.name,
        payload.email,
        payload.telegram_id
    )
    .execute(pool)
    .await?
    .last_insert_rowid();

    Ok(User { id, name: payload.name, email: payload.email, telegram_id: payload.telegram_id })
}
*/

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