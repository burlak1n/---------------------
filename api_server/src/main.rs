use axum::{
    extract::{State, Path},
    routing::{get, post, put, delete},
    Router,
    Json,
    http::StatusCode,
};
use std::net::SocketAddr;
use core_logic::{Slot, Booking, User, CreateSlotRequest, CreateBookingRequest, CreateUserRequest, Record, UpdateSlotRequest, UpdateUserRequest};
use sqlx::SqlitePool;
use utoipa::OpenApi;
use utoipa_swagger_ui::SwaggerUi;
use tower_http::cors::{CorsLayer, Any};

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

    // Настройка CORS
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let app = Router::new()
        .merge(SwaggerUi::new("/swagger-ui").url("/api-docs/openapi.json", ApiDoc::openapi()))
        .route("/slots", get(get_slots).post(create_slot))
        .route("/slots/:id", put(update_slot).delete(delete_slot))
        .route("/bookings", post(create_booking).get(get_bookings))
        .route("/bookings/:id", delete(delete_booking))
        .route("/users", get(get_users).post(create_user))
        .route("/users/:id", put(update_user).delete(delete_user))
        .layer(cors)
        .with_state(pool);

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
async fn get_slots(State(pool): State<SqlitePool>) -> Result<Json<Vec<Slot>>, (StatusCode, String)> {
    match core_logic::db::get_available_slots(&pool).await {
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
async fn create_slot(State(pool): State<SqlitePool>, Json(payload): Json<CreateSlotRequest>) -> Result<Json<Slot>, (StatusCode, String)> {
    match core_logic::db::create_slot(&pool, payload).await {
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
async fn create_booking(State(pool): State<SqlitePool>, Json(payload): Json<CreateBookingRequest>) -> Result<Json<Booking>, (StatusCode, String)> {
    match core_logic::db::create_booking(&pool, payload).await {
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
async fn get_bookings(State(pool): State<SqlitePool>) -> Result<Json<Vec<Record>>, (StatusCode, String)> {
    match core_logic::db::get_all_bookings(&pool).await {
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
async fn get_users(State(pool): State<SqlitePool>) -> Result<Json<Vec<User>>, (StatusCode, String)> {
    match core_logic::db::get_users(&pool).await {
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
async fn create_user(State(pool): State<SqlitePool>, Json(payload): Json<CreateUserRequest>) -> Result<Json<User>, (StatusCode, String)> {
    match core_logic::db::create_user(&pool, payload).await {
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
    State(pool): State<SqlitePool>, 
    Path(slot_id): Path<i64>, 
    Json(payload): Json<UpdateSlotRequest>
) -> Result<Json<Slot>, (StatusCode, String)> {
    match core_logic::db::update_slot(&pool, slot_id, payload).await {
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
    State(pool): State<SqlitePool>, 
    Path(slot_id): Path<i64>
) -> Result<StatusCode, (StatusCode, String)> {
    match core_logic::db::delete_slot(&pool, slot_id).await {
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
    State(pool): State<SqlitePool>, 
    Path(user_id): Path<i64>, 
    Json(payload): Json<UpdateUserRequest>
) -> Result<Json<User>, (StatusCode, String)> {
    match core_logic::db::update_user(&pool, user_id, payload).await {
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
    State(pool): State<SqlitePool>, 
    Path(user_id): Path<i64>
) -> Result<StatusCode, (StatusCode, String)> {
    match core_logic::db::delete_user(&pool, user_id).await {
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
    State(pool): State<SqlitePool>, 
    Path(booking_id): Path<i64>
) -> Result<StatusCode, (StatusCode, String)> {
    match core_logic::db::delete_booking(&pool, booking_id).await {
        Ok(_) => Ok(StatusCode::NO_CONTENT),
        Err(e) => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Database error: {}", e),
        )),
    }
}
