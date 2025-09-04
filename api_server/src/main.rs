use axum::{
    extract::{State, Path},
    routing::{get, post, put, delete},
    Router,
    Json,
    http::StatusCode,
    response::{Response},
    http::Request,
    middleware::{self, Next},
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
    // Voting system structures
    Vote, CreateVoteRequest, VoteResponse, NextSurveyResponse, SurveyVoteSummary,
    // Auth structures
    TelegramAuth, AuthResponse,
};
use core_logic::RabbitMQClient;
use sqlx::SqlitePool;
use utoipa::OpenApi;
use utoipa_swagger_ui::SwaggerUi;
use tower_http::cors::{CorsLayer, Any};
use serde_json::Error as JsonError;

// Состояние приложения
#[derive(Clone)]
struct AppState {
    pool: SqlitePool,
    rabbitmq: Arc<RabbitMQClient>,
}

// Middleware для обработки ошибок JSON
async fn json_error_handler(
    req: Request<axum::body::Body>,
    next: Next,
) -> Result<Response, (StatusCode, String)> {
    let response = next.run(req).await;
    
    // Если это ошибка десериализации, возвращаем более понятное сообщение
    if let Some(error) = response.extensions().get::<JsonError>() {
        let error_msg = if error.to_string().contains("start_time") {
            "Ошибка в поле 'start_time': ожидается корректная дата в формате ISO 8601 (например: 2024-01-15T10:30:00Z)"
        } else if error.to_string().contains("premature end of input") {
            "Неполный JSON: проверьте, что все обязательные поля заполнены"
        } else {
            &format!("Ошибка в JSON: {}", error)
        };
        
        return Err((StatusCode::BAD_REQUEST, error_msg.to_string()));
    }
    
    Ok(response)
}

#[derive(OpenApi)]
#[openapi(
    paths(
        get_slots,
        get_all_slots,
        create_slot,
        create_booking,
        get_users,
        create_user,
        get_bookings,
        get_next_survey,
        create_vote,
        get_survey_summary,
        set_user_role,
        sync_users,
        authenticate_telegram,
    ),
    components(
        schemas(Slot, Booking, User, CreateSlotRequest, CreateBookingRequest, CreateUserRequest, Record, CreateVoteRequest, VoteResponse, NextSurveyResponse, SurveyVoteSummary, TelegramAuth, AuthResponse)
    ),
    tags(
        (name = "interview-booking", description = "Interview Booking API"),
        (name = "voting-system", description = "Voting System API")
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
        .route("/slots/all", get(get_all_slots))
        .route("/slots/best", get(get_best_slots))
        .route("/slots/{id}", put(update_slot).delete(delete_slot))
        .route("/bookings", post(create_booking).get(get_bookings))
        .route("/bookings/{id}", delete(delete_booking))
        .route("/user_roles", get(get_users).post(create_user))
        .route("/user_roles/{id}", put(update_user).delete(delete_user))
        .route("/votes", get(get_all_votes))
        // Event-Driven broadcast endpoints
        .route("/broadcast", post(create_broadcast).get(get_all_broadcasts))
        .route("/broadcast/{id}", delete(delete_broadcast))
        .route("/broadcast/{id}/status", get(get_broadcast_status))
        .route("/broadcast/{id}/messages", get(get_broadcast_messages))
        .route("/broadcast/{id}/retry", post(retry_broadcast_message))
        .route("/broadcast/{id}/cancel", post(cancel_broadcast))
        // Voting system endpoints
        .route("/surveys/next", get(get_next_survey))
        .route("/surveys/{id}/vote", post(create_vote))
        .route("/surveys/{id}/summary", get(get_survey_summary))
        .route("/users/{id}/role", put(set_user_role))
        .route("/surveys/sync", post(sync_users))
        .route("/auth/telegram", post(authenticate_telegram))
        .layer(cors)
        .layer(middleware::from_fn(json_error_handler))
        .with_state(state);

    let addr = SocketAddr::from(([0, 0, 0, 0], 3000));
    println!("🚀 API сервер запускается на {}", addr);
    println!("📝 Логирование включено");
    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    println!("✅ Сервер готов принимать соединения");
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
    println!("📋 GET /slots - получение доступных слотов");
    match core_logic::db::get_available_slots(&state.pool).await {
        Ok(slots) => {
            println!("✅ Получено {} доступных слотов", slots.len());
            Ok(Json(slots))
        },
        Err(e) => {
            println!("❌ Ошибка при получении слотов: {}", e);
            Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Database error: {}", e),
            ))
        },
    }
}

#[utoipa::path(
    get,
    path = "/slots/all",
    responses(
        (status = 200, description = "List all slots", body = [Slot])
    )
)]
async fn get_all_slots(State(state): State<AppState>) -> Result<Json<Vec<Slot>>, (StatusCode, String)> {
    println!("📋 GET /slots/all - получение всех слотов");
    match core_logic::db::get_all_slots(&state.pool).await {
        Ok(slots) => {
            println!("✅ Получено {} всех слотов", slots.len());
            Ok(Json(slots))
        },
        Err(e) => {
            println!("❌ Ошибка при получении всех слотов: {}", e);
            Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Database error: {}", e),
            ))
        },
    }
}

#[utoipa::path(
    get,
    path = "/slots/best",
    responses(
        (status = 200, description = "List top 3 best slots", body = [Slot])
    )
)]
async fn get_best_slots(State(state): State<AppState>) -> Result<Json<Vec<Slot>>, (StatusCode, String)> {
    println!("🏆 GET /slots/best - получение топ-6 лучших слотов");
    match core_logic::db::get_best_slots_for_booking(&state.pool, 6).await {
        Ok(slots) => {
            println!("✅ Получено {} лучших слотов", slots.len());
            Ok(Json(slots))
        },
        Err(e) => {
            println!("❌ Ошибка при получении лучших слотов: {}", e);
            Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Database error: {}", e),
            ))
        },
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
    // Валидация входных данных
    if payload.start_time.timestamp() < chrono::Utc::now().timestamp() {
        return Err((
            StatusCode::BAD_REQUEST,
            "Дата начала слота не может быть в прошлом".to_string(),
        ));
    }
    
    if payload.place.trim().is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            "Место проведения не может быть пустым".to_string(),
        ));
    }
    
    if payload.max_users == 0 {
        return Err((
            StatusCode::BAD_REQUEST,
            "Максимальное количество пользователей должно быть больше 0".to_string(),
        ));
    }
    
    match core_logic::db::create_slot(&state.pool, payload).await {
        Ok(slot) => Ok(Json(slot)),
        Err(e) => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Ошибка базы данных: {}", e),
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
    path = "/user_roles",
    responses(
        (status = 200, description = "List of responsible user IDs", body = Vec<i64>)
    )
)]
async fn get_users(State(state): State<AppState>) -> Result<Json<Vec<i64>>, (StatusCode, String)> {
    match core_logic::db::get_users(&state.pool).await {
        Ok(telegram_ids) => Ok(Json(telegram_ids)),
        Err(e) => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Database error: {}", e),
        )),
    }
}

#[utoipa::path(
    get,
    path = "/votes",
    responses(
        (status = 200, description = "List of all votes", body = [Vote])
    )
)]
async fn get_all_votes(State(state): State<AppState>) -> Result<Json<Vec<Vote>>, (StatusCode, String)> {
    match core_logic::db::get_all_votes(&state.pool).await {
        Ok(votes) => Ok(Json(votes)),
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
    println!("Обновляем слот {} с данными: {:?}", slot_id, payload);
    
    match core_logic::db::update_slot(&state.pool, slot_id, payload).await {
        Ok(slot) => {
            println!("Слот {} успешно обновлен: {:?}", slot_id, slot);
            Ok(Json(slot))
        },
        Err(e) => {
            println!("Ошибка при обновлении слота {}: {}", slot_id, e);
            Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Database error: {}", e),
            ))
        },
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
    Path(telegram_id): Path<i64>, 
    Json(payload): Json<UpdateUserRequest>
) -> Result<Json<User>, (StatusCode, String)> {
    match core_logic::db::update_user(&state.pool, telegram_id, payload).await {
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
    Path(telegram_id): Path<i64>
) -> Result<StatusCode, (StatusCode, String)> {
    match core_logic::db::delete_user(&state.pool, telegram_id).await {
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
    println!("=== CREATE BROADCAST REQUEST ===");
    println!("Message: {}", payload.message);
    println!("Selected external users: {:?}", payload.selected_external_users);
    
    // ЗАКОММЕНТИРОВАНО: Логика работы с локальными пользователями
    // let users = if let Some(selected_user_ids) = &payload.selected_users {
    //     let all_users = core_logic::db::get_users_for_broadcast(&state.pool, payload.include_users_without_telegram).await
    //         .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to get users: {}", e)))?;
    //     all_users.into_iter()
    //         .filter(|user| selected_user_ids.contains(&user.id))
    //         .collect()
    // } else {
    //     core_logic::db::get_users_for_broadcast(&state.pool, payload.include_users_without_telegram).await
    //         .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to get users: {}", e)))?
    // };

    // Создаем рассылку в БД (пользователи будут обработаны внутри handle_create_broadcast)
    let (result, event) = match core_logic::db::handle_create_broadcast(&state.pool, payload.clone()).await {
        Ok((result, event)) => (result, event),
        Err(e) => return Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to create broadcast: {}", e),
        )),
    };

    println!("Broadcast created with ID: {}", result.broadcast_id);

    // Отправляем событие в RabbitMQ
    if let Err(e) = state.rabbitmq.publish_event(&event).await {
        eprintln!("Failed to publish broadcast event: {}", e);
        // Не возвращаем ошибку, так как рассылка уже создана в БД
    } else {
        println!("Event published to RabbitMQ successfully");
    }

    Ok(Json(result))
}

#[utoipa::path(
    delete,
    path = "/broadcast/{id}",
    params(
        ("id" = String, Path, description = "Broadcast ID")
    ),
    responses(
        (status = 200, description = "Broadcast deleted successfully"),
        (status = 404, description = "Broadcast not found"),
        (status = 500, description = "Internal server error")
    )
)]
async fn delete_broadcast(
    State(state): State<AppState>,
    Path(broadcast_id): Path<String>,
) -> Result<StatusCode, (StatusCode, String)> {
    match core_logic::db::delete_broadcast(&state.pool, &broadcast_id).await {
        Ok(_) => Ok(StatusCode::OK),
        Err(e) => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to delete broadcast: {}", e),
        )),
    }
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
        telegram_id: payload.telegram_id,
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

// Voting System Endpoints

#[utoipa::path(
    get,
    path = "/surveys/next",
    params(
        ("telegram_id" = i64, Query, description = "Telegram ID пользователя")
    ),
    responses(
        (status = 200, description = "Next survey retrieved successfully", body = NextSurveyResponse)
    )
)]
async fn get_next_survey(
    State(state): State<AppState>,
    axum::extract::Query(params): axum::extract::Query<std::collections::HashMap<String, String>>,
) -> Result<Json<NextSurveyResponse>, (StatusCode, String)> {
    let telegram_id = params.get("telegram_id")
        .and_then(|s| s.parse::<i64>().ok())
        .ok_or_else(|| (StatusCode::BAD_REQUEST, "telegram_id is required".to_string()))?;
    
    match core_logic::get_next_survey(&state.pool, telegram_id).await {
        Ok(response) => Ok(Json(response)),
        Err(e) => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Database error: {}", e),
        )),
    }
}

#[utoipa::path(
    post,
    path = "/surveys/{id}/vote",
    params(
        ("id" = i64, Path, description = "Survey ID (Telegram ID владельца анкеты)"),
        ("telegram_id" = i64, Query, description = "Telegram ID голосующего")
    ),
    request_body = CreateVoteRequest,
    responses(
        (status = 200, description = "Vote created successfully", body = VoteResponse)
    )
)]
async fn create_vote(
    State(state): State<AppState>,
    Path(survey_id): Path<i64>,
    axum::extract::Query(params): axum::extract::Query<std::collections::HashMap<String, String>>,
    Json(payload): Json<CreateVoteRequest>,
) -> Result<Json<VoteResponse>, (StatusCode, String)> {
    let voter_telegram_id = params.get("telegram_id")
        .and_then(|s| s.parse::<i64>().ok())
        .ok_or_else(|| (StatusCode::BAD_REQUEST, "telegram_id is required".to_string()))?;
    
    // Убеждаемся, что survey_id в пути совпадает с survey_id в теле запроса
    if payload.survey_id != survey_id {
        return Err((
            StatusCode::BAD_REQUEST,
            "Survey ID in path and body must match".to_string(),
        ));
    }
    
    match core_logic::handle_vote(&state.pool, payload, voter_telegram_id).await {
        Ok(response) => Ok(Json(response)),
        Err(e) => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Database error: {}", e),
        )),
    }
}

#[utoipa::path(
    get,
    path = "/surveys/{id}/summary",
    params(
        ("id" = i64, Path, description = "Survey ID (Telegram ID владельца анкеты)")
    ),
    responses(
        (status = 200, description = "Survey summary retrieved successfully", body = SurveyVoteSummary)
    )
)]
async fn get_survey_summary(
    State(state): State<AppState>,
    Path(survey_id): Path<i64>,
) -> Result<Json<SurveyVoteSummary>, (StatusCode, String)> {
    match core_logic::get_survey_vote_summary(&state.pool, survey_id).await {
        Ok(summary) => Ok(Json(summary)),
        Err(e) => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Database error: {}", e),
        )),
    }
}

#[utoipa::path(
    put,
    path = "/users/{id}/role",
    params(
        ("id" = i64, Path, description = "Telegram ID пользователя")
    ),
    request_body = i32,
    responses(
        (status = 200, description = "User role updated successfully")
    )
)]
async fn set_user_role(
    State(state): State<AppState>,
    Path(telegram_id): Path<i64>,
    Json(role): Json<i32>,
) -> Result<StatusCode, (StatusCode, String)> {
    if role != 0 && role != 1 {
        return Err((
            StatusCode::BAD_REQUEST,
            "Role must be 0 (regular user) or 1 (responsible user)".to_string(),
        ));
    }
    
    match core_logic::set_user_role(&state.pool, telegram_id, role).await {
        Ok(_) => Ok(StatusCode::OK),
        Err(e) => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Database error: {}", e),
        )),
    }
}

#[utoipa::path(
    post,
    path = "/surveys/sync",
    responses(
        (status = 200, description = "Users synced successfully")
    )
)]
async fn sync_users(
    State(state): State<AppState>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    match core_logic::db::sync_users_from_external_api(&state.pool).await {
        Ok(synced_user_ids) => {
            let response = serde_json::json!({
                "success": true,
                "message": format!("Синхронизировано {} пользователей", synced_user_ids.len()),
                "synced_count": synced_user_ids.len(),
                "user_ids": synced_user_ids
            });
            Ok(Json(response))
        }
        Err(e) => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Ошибка синхронизации: {}", e),
        )),
    }
}

#[utoipa::path(
    post,
    path = "/auth/telegram",
    request_body = TelegramAuth,
    responses(
        (status = 200, description = "Authentication result", body = AuthResponse)
    )
)]
#[axum::debug_handler]
async fn authenticate_telegram(
    State(state): State<AppState>,
    Json(telegram_auth): Json<TelegramAuth>,
) -> Result<Json<AuthResponse>, (StatusCode, String)> {
    match core_logic::authenticate_user(telegram_auth.clone()).await {
        Ok(mut auth_response) => {
            if auth_response.success {
                // Получаем роль пользователя из базы данных
                match core_logic::get_user_role_from_db(&state.pool, telegram_auth.id).await {
                    Ok(user_role) => {
                        auth_response.user_role = user_role;
                        Ok(Json(auth_response))
                    }
                    Err(e) => {
                        eprintln!("Ошибка получения роли пользователя: {}", e);
                        Ok(Json(auth_response)) // Возвращаем ответ без роли
                    }
                }
            } else {
                Ok(Json(auth_response))
            }
        }
        Err(e) => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Ошибка авторизации: {}", e),
        )),
    }
}
