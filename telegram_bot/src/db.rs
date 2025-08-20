use sqlx::{migrate::MigrateDatabase, Sqlite, SqlitePool, FromRow};
use std::env;

#[derive(Debug, FromRow, Clone)]
pub struct Slot {
    pub id: i64,
    pub time: String,
    pub place: String,
    pub max_user: i64,
}

#[derive(Debug, FromRow, Clone)]
pub struct Record {
    pub id: i64,
    pub user_id: i64,
    pub slot_id: Option<i64>,
}

#[derive(Debug, FromRow, Clone)]
pub struct AllowedUser {
    pub user_id: i64,
}

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
        "CREATE TABLE IF NOT EXISTS records ( id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL UNIQUE, slot_id INTEGER, FOREIGN KEY (slot_id) REFERENCES slots(id) );",
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
