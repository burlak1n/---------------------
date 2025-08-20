pub mod db;

pub use db::{
    get_available_slots,
    get_slot,
    create_or_update_booking,
    create_slot,
    create_booking,
    get_users,
    create_user,
    get_user_by_telegram_id,
    get_todays_bookings,
    get_all_bookings,
};

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use utoipa::ToSchema;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum BookingError {
    #[error("Слот переполнен: максимальное количество пользователей {max_users}, текущее количество {current_count}")]
    SlotFull { max_users: u16, current_count: u16 },
    #[error("Слот не найден")]
    SlotNotFound,
    #[error("Пользователь не найден")]
    UserNotFound,
    #[error("Ошибка базы данных: {0}")]
    Database(#[from] sqlx::Error),
}

// Единая структура для слота, объединяющая поля из обоих источников.
#[derive(Debug, Clone, FromRow, Serialize, Deserialize, ToSchema)]
pub struct Slot {
    pub id: i64,
    #[schema(value_type = String)]
    pub time: DateTime<Utc>,
    pub place: String,
    pub max_user: u16,
}

// Структура перенесена из telegram_bot/src/db.rs
#[derive(Debug, Clone, FromRow, Serialize, Deserialize, ToSchema)]
pub struct Record {
    pub id: i64,
    pub user_id: i64,
    pub slot_id: Option<i64>,
    pub created_at: Option<DateTime<Utc>>,
}



// Новая структура для события из API
#[derive(Debug, Deserialize, ToSchema)]
pub struct Event {
    pub summary: String,
    pub start: EventTime,
    pub end: EventTime,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct EventTime {
    #[serde(rename = "dateTime")]
    pub date_time: DateTime<Utc>,
}


// Новая структура для слота, создаваемого из события API
#[derive(Debug, Serialize, ToSchema)]
pub struct ApiSlot {
    pub start_time: DateTime<Utc>,
    pub place: String,
}


// Новая структура для бронирования через API
#[derive(Debug, Deserialize, Serialize, ToSchema)]
pub struct Booking {
    pub slot_id: String,
    pub user_id: i64,
}


// Новая структура для ответа API
#[derive(Debug, Serialize, ToSchema)]
pub struct ApiResponse {
    pub success: bool,
    pub message: String,
}

// Новая структура для пользователя API
#[derive(Debug, Clone, FromRow, Serialize, Deserialize, ToSchema)]
pub struct User {
    pub id: i64,
    pub name: String,
    pub telegram_id: Option<i64>,
}

// Новая структура для ответа API со слотами
#[derive(Debug, Serialize, ToSchema)]
pub struct SlotsResponse {
    pub slots: Vec<ApiSlot>,
}

// Новая структура для ответа API с бронированиями
#[derive(Debug, Serialize, ToSchema)]
pub struct BookingsResponse {
    pub bookings: Vec<Booking>,
}

// Новая структура для ответа API с пользователями
#[derive(Debug, Serialize, ToSchema)]
pub struct UsersResponse {
    pub users: Vec<User>,
}

// Новая структура для ответа API с одним пользователем
#[derive(Debug, Serialize, ToSchema)]
pub struct UserResponse {
    pub user: User,
}

// Новая структура для ответа API с одним слотом
#[derive(Debug, Serialize, ToSchema)]
pub struct SlotResponse {
    pub slot: ApiSlot,
}

// Новая структура для ответа API с одним бронированием
#[derive(Debug, Serialize, ToSchema)]
pub struct BookingResponse {
    pub booking: Booking,
}

// Новая структура для ответа API с ошибкой
#[derive(Debug, Serialize, ToSchema)]
pub struct ErrorResponse {
    pub error: String,
}

// Новая структура для запроса на создание слота
#[derive(Debug, Deserialize, ToSchema)]
pub struct CreateSlotRequest {
    pub start_time: DateTime<Utc>,
    pub place: String,
    pub max_users: u16,
}

// Новая структура для запроса на создание бронирования
#[derive(Debug, Deserialize, ToSchema)]
pub struct CreateBookingRequest {
    pub slot_id: String,
    pub user_id: i64,
}

// Новая структура для запроса на создание пользователя
#[derive(Debug, Deserialize, ToSchema)]
pub struct CreateUserRequest {
    pub name: String,
    pub telegram_id: Option<i64>,
}

// Новая структура для запроса на обновление слота
#[derive(Debug, Deserialize, ToSchema)]
pub struct UpdateSlotRequest {
    pub start_time: Option<DateTime<Utc>>,
    pub place: Option<String>,
}

// Новая структура для запроса на обновление бронирования
#[derive(Debug, Deserialize, ToSchema)]
pub struct UpdateBookingRequest {
    pub user_name: Option<String>,
}

// Новая структура для запроса на обновление пользователя
#[derive(Debug, Deserialize, ToSchema)]
pub struct UpdateUserRequest {
    pub name: Option<String>,
    pub telegram_id: Option<i64>,
}

#[derive(Debug, Clone, FromRow, Serialize, Deserialize, ToSchema)]
pub struct BookingInfo {
    pub telegram_id: i64,
    #[schema(value_type = String)]
    pub time: DateTime<Utc>,
    pub place: String,
}
