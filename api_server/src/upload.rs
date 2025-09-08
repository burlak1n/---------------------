use axum::{
    extract::{State, Multipart},
    Json,
    http::StatusCode,
};
use core_logic::FileUploadResponse;
use telegram_bot::broadcast::upload_file_to_telegram;

// Используем AppState из main.rs
use crate::AppState;

#[utoipa::path(
    post,
    path = "/upload",
    responses(
        (status = 200, description = "File uploaded successfully", body = FileUploadResponse),
        (status = 400, description = "Bad request", body = FileUploadResponse),
        (status = 500, description = "Internal server error", body = FileUploadResponse)
    )
)]
pub async fn upload_file(
    State(state): State<AppState>,
    mut multipart: Multipart,
) -> Result<Json<FileUploadResponse>, (StatusCode, Json<FileUploadResponse>)> {
    println!("📁 POST /upload - загрузка файла в Telegram");
    
    // Извлекаем файл из multipart
    let mut file_data = Vec::new();
    let mut filename = String::new();
    let mut mime_type = String::new();
    
    while let Some(field) = multipart.next_field().await.map_err(|e| {
        println!("❌ Ошибка при извлечении поля multipart: {}", e);
        (StatusCode::BAD_REQUEST, Json(FileUploadResponse {
            success: false,
            message: format!("Error reading multipart: {}", e),
            file_id: None,
            file_type: None,
        }))
    })? {
        if field.name() == Some("file") {
            filename = field.file_name().unwrap_or("unknown").to_string();
            mime_type = field.content_type().unwrap_or("application/octet-stream").to_string();
            
            let data = field.bytes().await.map_err(|e| {
                println!("❌ Ошибка при чтении данных файла: {}", e);
                (StatusCode::BAD_REQUEST, Json(FileUploadResponse {
                    success: false,
                    message: format!("Error reading file data: {}", e),
                    file_id: None,
                    file_type: None,
                }))
            })?;
            
            file_data = data.to_vec();
            break;
        }
    }
    
    if file_data.is_empty() {
        return Err((StatusCode::BAD_REQUEST, Json(FileUploadResponse {
            success: false,
            message: "No file provided".to_string(),
            file_id: None,
            file_type: None,
        })));
    }
    
    // Загружаем файл в Telegram
    match upload_file_to_telegram(&state.bot, &file_data, &filename, &mime_type).await {
        Ok(file_id) => {
            println!("✅ Файл успешно загружен: file_id={}", file_id);
            Ok(Json(FileUploadResponse {
                success: true,
                message: "File uploaded successfully".to_string(),
                file_id: Some(file_id),
                file_type: Some(mime_type),
            }))
        },
        Err(e) => {
            println!("❌ Ошибка при загрузке файла в Telegram: {}", e);
            Err((StatusCode::INTERNAL_SERVER_ERROR, Json(FileUploadResponse {
                success: false,
                message: format!("Failed to upload file to Telegram: {}", e),
                file_id: None,
                file_type: None,
            })))
        }
    }
}
