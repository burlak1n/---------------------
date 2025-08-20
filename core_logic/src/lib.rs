pub mod db;

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use utoipa::ToSchema;

// Единая структура для слота, объединяющая поля из обоих источников.
#[derive(Debug, Clone, FromRow, Serialize, Deserialize, ToSchema)]
pub struct Slot {
    pub id: i64,
    // Из старой структуры
    pub time: String,
    pub place: String,
    pub max_user: i64,
    // Из новой структуры
    #[sqlx(default)] // Позволяет полю отсутствовать в запросе, если оно не нужно
    pub start_time: Option<DateTime<Utc>>,
}

// Структура перенесена из telegram_bot/src/db.rs
#[derive(Debug, Clone, FromRow, Serialize, Deserialize, ToSchema)]
pub struct Record {
    pub id: i64,
    pub user_id: i64,
    pub slot_id: Option<i64>,
}

// Структура перенесена из telegram_bot/src/db.rs
#[derive(Debug, Clone, FromRow, Serialize, Deserialize, ToSchema)]
pub struct AllowedUser {
    pub user_id: i64,
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
    pub end_time: DateTime<Utc>,
    pub title: String,
}


// Новая структура для бронирования через API
#[derive(Debug, Deserialize, Serialize, ToSchema)]
pub struct Booking {
    pub slot_id: String,
    pub user_name: String,
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
    pub email: String,
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
    pub end_time: DateTime<Utc>,
    pub title: String,
}

// Новая структура для запроса на создание бронирования
#[derive(Debug, Deserialize, ToSchema)]
pub struct CreateBookingRequest {
    pub slot_id: String,
    pub user_name: String,
}

// Новая структура для запроса на создание пользователя
#[derive(Debug, Deserialize, ToSchema)]
pub struct CreateUserRequest {
    pub name: String,
    pub email: String,
    pub telegram_id: Option<i64>,
}

// Новая структура для запроса на обновление слота
#[derive(Debug, Deserialize, ToSchema)]
pub struct UpdateSlotRequest {
    pub start_time: Option<DateTime<Utc>>,
    pub end_time: Option<DateTime<Utc>>,
    pub title: Option<String>,
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
    pub email: Option<String>,
}

#[derive(Debug, Clone, FromRow, Serialize, Deserialize, ToSchema)]
pub struct BookingInfo {
    pub telegram_id: i64,
    pub time: String,
    pub place: String,
}
