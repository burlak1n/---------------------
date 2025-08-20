use axum::{
    extract::{State, Path},
    routing::{get, post, put, delete},
    Router,
    Json,
    http::StatusCode,
};
use std::net::SocketAddr;
use std::sync::Arc;
use chrono;
use core_logic::{
    Slot, Booking, User, CreateSlotRequest, CreateBookingRequest, CreateUserRequest, Record, 
    UpdateSlotRequest, UpdateUserRequest,
    // Event-Driven structures
    CreateBroadcastCommand, BroadcastCreatedResponse, BroadcastStatusResponse,
    GetBroadcastStatusQuery, GetBroadcastMessagesQuery, RetryMessageCommand, CancelBroadcastCommand,
    BroadcastEvent,
};
mod rabbitmq;
use rabbitmq::RabbitMQClient;
use sqlx::SqlitePool;
use utoipa::OpenApi;
use utoipa_swagger_ui::SwaggerUi;
use tower_http::cors::{CorsLayer, Any};

// Состояние приложения
#[derive(Clone)]
struct AppState {
    pool: SqlitePool,
    rabbitmq: Arc<RabbitMQClient>,
}

#[derive(OpenApi)]
#[openapi(
    paths(
        get_slots,
        create_slot,
        create_booking,
        get_users,
        create_user,
        get_bookings,
    ),
    components(
        schemas(Slot, Booking, User, CreateSlotRequest, CreateBookingRequest, CreateUserRequest, Record)
    ),
    tags(
        (name = "interview-booking", description = "Interview Booking API")
    )
)]
struct ApiDoc;

#[tokio::main]
async fn main() {
    // Загружаем переменные окружения из .env файла
    dotenvy::dotenv().expect(".env file not found");

    // Инициализируем пул соединений с БД
    let pool = core_logic::db::init_db().await.expect("Failed to initialize database");

    // Инициализируем RabbitMQ клиент
    let rabbitmq = Arc::new(RabbitMQClient::new().await.expect("Failed to initialize RabbitMQ"));

    let state = AppState { pool, rabbitmq };

    // Настройка CORS
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let app = Router::new()
        .merge(SwaggerUi::new("/swagger-ui").url("/api-docs/openapi.json", ApiDoc::openapi()))
        .route("/slots", get(get_slots).post(create_slot))
        .route("/slots/{id}", put(update_slot).delete(delete_slot))
        .route("/bookings", post(create_booking).get(get_bookings))
        .route("/bookings/{id}", delete(delete_booking))
        .route("/users", get(get_users).post(create_user))
        .route("/users/{id}", put(update_user).delete(delete_user))
        // Event-Driven broadcast endpoints
        .route("/broadcast", post(create_broadcast).get(get_all_broadcasts))
        .route("/broadcast/{id}/status", get(get_broadcast_status))
        .route("/broadcast/{id}/messages", get(get_broadcast_messages))
        .route("/broadcast/{id}/retry", post(retry_broadcast_message))
        .route("/broadcast/{id}/cancel", post(cancel_broadcast))
        .layer(cors)
        .with_state(state);

    let addr = SocketAddr::from(([127, 0, 0, 1], 3000));
    println!("listening on {}", addr);
    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

#[utoipa::path(
    get,
    path = "/slots",
    responses(
        (status = 200, description = "List all available slots", body = [Slot])
    )
)]
async fn get_slots(State(state): State<AppState>) -> Result<Json<Vec<Slot>>, (StatusCode, String)> {
    match core_logic::db::get_available_slots(&state.pool).await {
        Ok(slots) => Ok(Json(slots)),
        Err(e) => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Database error: {}", e),
        )),
    }
}

#[utoipa::path(
    post,
    path = "/slots",
    request_body = CreateSlotRequest,
    responses(
        (status = 201, description = "Slot created successfully", body = Slot)
    )
)]
async fn create_slot(State(state): State<AppState>, Json(payload): Json<CreateSlotRequest>) -> Result<Json<Slot>, (StatusCode, String)> {
    match core_logic::db::create_slot(&state.pool, payload).await {
        Ok(slot) => Ok(Json(slot)),
        Err(e) => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Database error: {}", e),
        )),
    }
}

#[utoipa::path(
    post,
    path = "/bookings",
    request_body = CreateBookingRequest,
    responses(
        (status = 201, description = "Booking created successfully", body = Booking)
    )
)]
async fn create_booking(State(state): State<AppState>, Json(payload): Json<CreateBookingRequest>) -> Result<Json<Booking>, (StatusCode, String)> {
    match core_logic::db::create_booking(&state.pool, payload).await {
        Ok(booking) => Ok(Json(booking)),
        Err(e) => {
            match e {
                core_logic::BookingError::SlotFull { max_users, current_count } => {
                    Err((
                        StatusCode::CONFLICT,
                        format!("Слот переполнен: максимальное количество пользователей {}, текущее количество {}", max_users, current_count),
                    ))
                }
                core_logic::BookingError::SlotNotFound => {
                    Err((
                        StatusCode::NOT_FOUND,
                        "Слот не найден".to_string(),
                    ))
                }
                core_logic::BookingError::UserNotFound => {
                    Err((
                        StatusCode::NOT_FOUND,
                        "Пользователь не найден".to_string(),
                    ))
                }
                core_logic::BookingError::Database(db_error) => {
                    Err((
                        StatusCode::INTERNAL_SERVER_ERROR,
                        format!("Ошибка базы данных: {}", db_error),
                    ))
                }
            }
        }
    }
}

#[utoipa::path(
    get,
    path = "/bookings",
    responses(
        (status = 200, description = "List all bookings", body = [Record])
    )
)]
async fn get_bookings(State(state): State<AppState>) -> Result<Json<Vec<Record>>, (StatusCode, String)> {
    match core_logic::db::get_all_bookings(&state.pool).await {
        Ok(bookings) => Ok(Json(bookings)),
        Err(e) => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Database error: {}", e),
        )),
    }
}

#[utoipa::path(
    get,
    path = "/users",
    responses(
        (status = 200, description = "List all users", body = [User])
    )
)]
async fn get_users(State(state): State<AppState>) -> Result<Json<Vec<User>>, (StatusCode, String)> {
    match core_logic::db::get_users(&state.pool).await {
        Ok(users) => Ok(Json(users)),
        Err(e) => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Database error: {}", e),
        )),
    }
}

#[utoipa::path(
    post,
    path = "/users",
    request_body = CreateUserRequest,
    responses(
        (status = 201, description = "User created successfully", body = User)
    )
)]
async fn create_user(State(state): State<AppState>, Json(payload): Json<CreateUserRequest>) -> Result<Json<User>, (StatusCode, String)> {
    match core_logic::db::create_user(&state.pool, payload).await {
        Ok(user) => Ok(Json(user)),
        Err(e) => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Database error: {}", e),
        )),
    }
}

#[utoipa::path(
    put,
    path = "/slots/{id}",
    request_body = UpdateSlotRequest,
    responses(
        (status = 200, description = "Slot updated successfully", body = Slot)
    )
)]
async fn update_slot(
    State(state): State<AppState>, 
    Path(slot_id): Path<i64>, 
    Json(payload): Json<UpdateSlotRequest>
) -> Result<Json<Slot>, (StatusCode, String)> {
    match core_logic::db::update_slot(&state.pool, slot_id, payload).await {
        Ok(slot) => Ok(Json(slot)),
        Err(e) => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Database error: {}", e),
        )),
    }
}

#[utoipa::path(
    delete,
    path = "/slots/{id}",
    responses(
        (status = 204, description = "Slot deleted successfully")
    )
)]
async fn delete_slot(
    State(state): State<AppState>, 
    Path(slot_id): Path<i64>
) -> Result<StatusCode, (StatusCode, String)> {
    match core_logic::db::delete_slot(&state.pool, slot_id).await {
        Ok(_) => Ok(StatusCode::NO_CONTENT),
        Err(e) => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Database error: {}", e),
        )),
    }
}

#[utoipa::path(
    put,
    path = "/users/{id}",
    request_body = UpdateUserRequest,
    responses(
        (status = 200, description = "User updated successfully", body = User)
    )
)]
async fn update_user(
    State(state): State<AppState>, 
    Path(user_id): Path<i64>, 
    Json(payload): Json<UpdateUserRequest>
) -> Result<Json<User>, (StatusCode, String)> {
    match core_logic::db::update_user(&state.pool, user_id, payload).await {
        Ok(user) => Ok(Json(user)),
        Err(e) => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Database error: {}", e),
        )),
    }
}

#[utoipa::path(
    delete,
    path = "/users/{id}",
    responses(
        (status = 204, description = "User deleted successfully")
    )
)]
async fn delete_user(
    State(state): State<AppState>, 
    Path(user_id): Path<i64>
) -> Result<StatusCode, (StatusCode, String)> {
    match core_logic::db::delete_user(&state.pool, user_id).await {
        Ok(_) => Ok(StatusCode::NO_CONTENT),
        Err(e) => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Database error: {}", e),
        )),
    }
}

#[utoipa::path(
    delete,
    path = "/bookings/{id}",
    responses(
        (status = 204, description = "Booking deleted successfully")
    )
)]
async fn delete_booking(
    State(state): State<AppState>, 
    Path(booking_id): Path<i64>
) -> Result<StatusCode, (StatusCode, String)> {
    match core_logic::db::delete_booking(&state.pool, booking_id).await {
        Ok(_) => Ok(StatusCode::NO_CONTENT),
        Err(e) => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Database error: {}", e),
        )),
    }
}

#[utoipa::path(
    post,
    path = "/broadcast",
    request_body = CreateBroadcastCommand,
    responses(
        (status = 201, description = "Broadcast created successfully", body = BroadcastCreatedResponse)
    )
)]
async fn create_broadcast(
    State(state): State<AppState>, 
    Json(payload): Json<CreateBroadcastCommand>
) -> Result<Json<BroadcastCreatedResponse>, (StatusCode, String)> {
    // Создаем рассылку в БД
    let result = match core_logic::db::handle_create_broadcast(&state.pool, payload.clone()).await {
        Ok(result) => result,
        Err(e) => return Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to create broadcast: {}", e),
        )),
    };

    // Отправляем событие в RabbitMQ
    let event = BroadcastEvent::BroadcastCreated {
        broadcast_id: result.broadcast_id.clone(),
        message: payload.message,
        target_users: vec![], // Воркер получит пользователей из БД
        created_at: chrono::Utc::now(),
    };

    if let Err(e) = state.rabbitmq.publish_event(&event).await {
        eprintln!("Failed to publish broadcast event: {}", e);
        // Не возвращаем ошибку, так как рассылка уже создана в БД
    }

    Ok(Json(result))
}

#[utoipa::path(
    get,
    path = "/broadcast",
    responses(
        (status = 200, description = "List all broadcasts", body = Vec<core_logic::BroadcastSummary>)
    )
)]
async fn get_all_broadcasts(
    State(state): State<AppState>,
) -> Result<Json<Vec<core_logic::BroadcastSummary>>, (StatusCode, String)> {
    match core_logic::db::get_all_broadcast_summaries(&state.pool, Some(50), Some(0)).await {
        Ok(broadcasts) => Ok(Json(broadcasts)),
        Err(e) => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to get broadcasts: {}", e),
        )),
    }
}

#[utoipa::path(
    get,
    path = "/broadcast/{id}/status",
    responses(
        (status = 200, description = "Broadcast status retrieved successfully", body = BroadcastStatusResponse)
    )
)]
async fn get_broadcast_status(
    State(state): State<AppState>,
    Path(broadcast_id): Path<String>,
) -> Result<Json<Option<BroadcastStatusResponse>>, (StatusCode, String)> {
    let query = GetBroadcastStatusQuery { broadcast_id };
    
    match core_logic::db::handle_get_broadcast_status(&state.pool, query).await {
        Ok(result) => Ok(Json(result)),
        Err(e) => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to get broadcast status: {}", e),
        )),
    }
}

#[utoipa::path(
    get,
    path = "/broadcast/{id}/messages",
    responses(
        (status = 200, description = "Broadcast messages retrieved successfully", body = Vec<core_logic::BroadcastMessageRecord>)
    )
)]
async fn get_broadcast_messages(
    State(state): State<AppState>,
    Path(broadcast_id): Path<String>,
) -> Result<Json<Vec<core_logic::BroadcastMessageRecord>>, (StatusCode, String)> {
    let query = GetBroadcastMessagesQuery {
        broadcast_id,
        status: None,
        limit: Some(100),
        offset: Some(0),
    };
    
    match core_logic::db::handle_get_broadcast_messages(&state.pool, query).await {
        Ok(result) => Ok(Json(result)),
        Err(e) => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to get broadcast messages: {}", e),
        )),
    }
}

#[utoipa::path(
    post,
    path = "/broadcast/{id}/retry",
    responses(
        (status = 200, description = "Message retry initiated successfully")
    )
)]
async fn retry_broadcast_message(
    State(state): State<AppState>,
    Path(broadcast_id): Path<String>,
    Json(payload): Json<RetryMessageCommand>,
) -> Result<StatusCode, (StatusCode, String)> {
    let command = RetryMessageCommand {
        broadcast_id,
        user_id: payload.user_id,
    };
    
    match core_logic::db::handle_retry_message(&state.pool, command).await {
        Ok(_) => Ok(StatusCode::OK),
        Err(e) => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to retry message: {}", e),
        )),
    }
}

#[utoipa::path(
    post,
    path = "/broadcast/{id}/cancel",
    responses(
        (status = 200, description = "Broadcast cancelled successfully")
    )
)]
async fn cancel_broadcast(
    State(state): State<AppState>,
    Path(broadcast_id): Path<String>,
) -> Result<StatusCode, (StatusCode, String)> {
    let command = CancelBroadcastCommand { broadcast_id };
    
    match core_logic::db::handle_cancel_broadcast(&state.pool, command).await {
        Ok(_) => Ok(StatusCode::OK),
        Err(e) => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to cancel broadcast: {}", e),
        )),
    }
}
