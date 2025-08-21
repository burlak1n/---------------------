pub mod db;
pub mod rabbitmq;

pub use db::{
    get_available_slots,
    get_all_slots,
    get_slot,
    create_or_update_booking,
    create_slot,
    create_booking,
    get_users,
    create_user,
    get_user_by_telegram_id,
    get_todays_bookings,
    get_all_bookings,
    update_slot,
    update_user,
    delete_slot,
    delete_user,
    delete_booking,
    get_users_for_broadcast,
    // Event Store functions
    save_broadcast_event, get_broadcast_events, is_event_processed,
    // Read Model functions
    create_broadcast_summary, update_broadcast_summary, update_broadcast_status, update_broadcast_summary_from_messages, get_broadcast_summary, get_all_broadcast_summaries,
    create_broadcast_message, update_broadcast_message, update_broadcast_message_status, get_broadcast_messages,
    // Command handlers
    handle_create_broadcast, handle_retry_message, handle_cancel_broadcast,
    // Delete functions
    delete_broadcast,
    // Query handlers
    handle_get_broadcast_status, handle_get_broadcast_messages,
};

pub use rabbitmq::{RabbitMQClient, EventsWorker, MessagesWorker};

use chrono::{DateTime, Utc, NaiveDateTime};
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
    pub booked_count: Option<i64>,
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
    pub max_users: Option<u16>,
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

#[derive(Debug, Deserialize, ToSchema)]
pub struct BroadcastRequest {
    pub message: String,
    pub include_users_without_telegram: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct BroadcastMessage {
    pub user_id: i64,
    pub telegram_id: Option<i64>,
    pub message: String,
    pub broadcast_id: String,
    pub message_type: Option<BroadcastMessageType>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct BroadcastResult {
    pub broadcast_id: String,
    pub total_users: usize,
    pub sent_count: usize,
    pub failed_count: usize,
    pub errors: Vec<String>,
    pub completed_at: DateTime<Utc>,
}

// Event-Driven Architecture Structures

#[derive(Debug, Serialize, Deserialize, Clone)]
pub enum BroadcastEvent {
    BroadcastCreated {
        broadcast_id: String,
        message: String,
        target_users: Vec<User>,
        created_at: DateTime<Utc>,
    },
    BroadcastStarted {
        broadcast_id: String,
        started_at: DateTime<Utc>,
    },
    MessageSent {
        broadcast_id: String,
        user_id: i64,
        telegram_id: i64,
        sent_at: DateTime<Utc>,
    },
    MessageFailed {
        broadcast_id: String,
        user_id: i64,
        telegram_id: i64,
        error: String,
        failed_at: DateTime<Utc>,
    },
    MessageRetrying {
        broadcast_id: String,
        user_id: i64,
        telegram_id: i64,
        retry_count: u32,
        retry_at: DateTime<Utc>,
    },
    BroadcastCompleted {
        broadcast_id: String,
        total_sent: u32,
        total_failed: u32,
        completed_at: DateTime<Utc>,
    },
}

#[derive(Debug, Serialize, Deserialize)]
pub struct BroadcastEventRecord {
    pub event_id: String,
    pub broadcast_id: String,
    pub event_type: String,
    pub event_data: String, // JSON
    pub created_at: NaiveDateTime,
    pub version: i64,
}

// Read Model Structures
#[derive(Debug, Serialize, Deserialize, Clone, ToSchema)]
pub struct BroadcastSummary {
    pub id: String,
    pub message: String,
    pub total_users: i64,
    pub sent_count: i64,
    pub failed_count: i64,
    pub pending_count: i64,
    pub status: BroadcastStatus,
    pub created_at: NaiveDateTime,
    pub started_at: Option<NaiveDateTime>,
    pub completed_at: Option<NaiveDateTime>,
}

#[derive(Debug, Serialize, Deserialize, Clone, ToSchema, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum BroadcastStatus {
    Pending,
    InProgress,
    Completed,
    Failed,
}

impl std::fmt::Display for BroadcastStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            BroadcastStatus::Pending => write!(f, "pending"),
            BroadcastStatus::InProgress => write!(f, "in_progress"),
            BroadcastStatus::Completed => write!(f, "completed"),
            BroadcastStatus::Failed => write!(f, "failed"),
        }
    }
}

impl From<String> for BroadcastStatus {
    fn from(s: String) -> Self {
        match s.as_str() {
            "pending" => BroadcastStatus::Pending,
            "in_progress" => BroadcastStatus::InProgress,
            "completed" => BroadcastStatus::Completed,
            "failed" => BroadcastStatus::Failed,
            _ => BroadcastStatus::Pending,
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone, ToSchema)]
pub struct BroadcastMessageRecord {
    pub id: i64,
    pub broadcast_id: String,
    pub user_id: i64,
    pub telegram_id: Option<i64>,
    pub status: MessageStatus,
    pub error: Option<String>,
    pub sent_at: Option<NaiveDateTime>,
    pub retry_count: i64,
    pub message_type: Option<BroadcastMessageType>,
    pub created_at: NaiveDateTime,
}

#[derive(Debug, Serialize, Deserialize, Clone, ToSchema, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum MessageStatus {
    Pending,
    Sent,
    Failed,
    Retrying,
}

impl std::fmt::Display for MessageStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            MessageStatus::Pending => write!(f, "pending"),
            MessageStatus::Sent => write!(f, "sent"),
            MessageStatus::Failed => write!(f, "failed"),
            MessageStatus::Retrying => write!(f, "retrying"),
        }
    }
}

impl From<String> for MessageStatus {
    fn from(s: String) -> Self {
        match s.as_str() {
            "pending" => MessageStatus::Pending,
            "sent" => MessageStatus::Sent,
            "failed" => MessageStatus::Failed,
            "retrying" => MessageStatus::Retrying,
            _ => MessageStatus::Pending,
        }
    }
}

// Command Structures
#[derive(Debug, Serialize, Deserialize, ToSchema, Clone)]
pub struct CreateBroadcastCommand {
    pub message: String,
    pub include_users_without_telegram: bool,
    pub message_type: Option<BroadcastMessageType>,
}

#[derive(Debug, Serialize, Deserialize, ToSchema, Clone, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum BroadcastMessageType {
    Custom,
    SignUp,
}

#[derive(Debug, Serialize, Deserialize, ToSchema)]
pub struct RetryMessageCommand {
    pub broadcast_id: String,
    pub user_id: i64,
}

#[derive(Debug, Serialize, Deserialize, ToSchema)]
pub struct CancelBroadcastCommand {
    pub broadcast_id: String,
}

// Query Structures
#[derive(Debug, Serialize, Deserialize)]
pub struct GetBroadcastStatusQuery {
    pub broadcast_id: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GetBroadcastMessagesQuery {
    pub broadcast_id: String,
    pub status: Option<MessageStatus>,
    pub limit: Option<i32>,
    pub offset: Option<i32>,
}

// Response Structures
#[derive(Debug, Serialize, Deserialize, ToSchema)]
pub struct BroadcastCreatedResponse {
    pub broadcast_id: String,
    pub status: BroadcastStatus,
}

#[derive(Debug, Serialize, Deserialize, ToSchema)]
pub struct BroadcastStatusResponse {
    pub broadcast: BroadcastSummary,
    pub messages: Vec<BroadcastMessageRecord>,
}

#[derive(Debug, Clone, FromRow, Serialize, Deserialize, ToSchema)]
pub struct BookingInfo {
    pub telegram_id: i64,
    #[schema(value_type = String)]
    pub time: DateTime<Utc>,
    pub place: String,
}
