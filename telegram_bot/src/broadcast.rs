use teloxide::prelude::*;
use tracing::{error, info};
use std::sync::Arc;
use sqlx::SqlitePool;
use core_logic::{BroadcastMessage, MessageStatus, MessagesWorker};
use anyhow::Error;

pub async fn broadcast_worker(bot: Bot, pool: Arc<SqlitePool>) -> Result<(), Box<dyn std::error::Error>> {
    info!("Starting broadcast worker...");

    // Создаем воркер для обработки сообщений
    let worker = MessagesWorker::new().await?;

    // Запускаем обработку сообщений
    worker.start_processing("telegram_broadcast_worker", move |message| {
        let bot = bot.clone();
        let pool = pool.clone();
        
        async move {
            handle_message(message, &bot, &pool).await
        }
    }).await?;

    Ok(())
}



async fn handle_message(
    message: BroadcastMessage,
    bot: &Bot,
    pool: &Arc<SqlitePool>,
) -> Result<(), Error> {
    // Отправляем сообщение в Telegram
    let send_result = send_telegram_message(bot, &message).await;

    match send_result {
        Ok(_) => {
            info!("✅ Successfully sent message to user {}", message.telegram_id);
            
            // Обновляем статус на "sent"
            if let Err(e) = core_logic::db::update_broadcast_message_status(
                pool,
                &message.broadcast_id,
                message.telegram_id,
                MessageStatus::Sent,
                None,
            ).await {
                error!("Failed to update message status to sent: {}", e);
            }
        }
        Err(e) => {
            let error_msg = e.to_string();
            error!("❌ Failed to send message to user {}: {}", message.telegram_id, error_msg);
            
            // Обновляем статус на "failed"
            if let Err(e) = core_logic::db::update_broadcast_message_status(
                pool,
                &message.broadcast_id,
                message.telegram_id,
                MessageStatus::Failed,
                Some(error_msg),
            ).await {
                error!("Failed to update message status to failed: {}", e);
            }
        }
    }

    Ok(())
}

// Функция для создания подписи к медиафайлу
fn create_media_caption(message: &BroadcastMessage, media_caption: &Option<String>, is_first_item: bool) -> Option<String> {
    if !is_first_item {
        return None;
    }
    
    // Если есть медиагруппа, текст сообщения уже объединен с подписью на фронтенде
    // Просто возвращаем подпись медиафайла
    media_caption.clone()
}

async fn send_telegram_message(
    bot: &Bot,
    message: &BroadcastMessage,
) -> Result<(), Error> {
    let telegram_id = message.telegram_id;
        info!("Sending message to Telegram user {}", telegram_id);
    info!("Message details: broadcast_id={}, message_type={:?}, has_media_group={}", 
          message.broadcast_id, message.message_type, message.media_group.is_some());
    
    // Переменная для отслеживания отправленных медиафайлов
    let mut input_media = Vec::new();
    let mut media_files_sent = false;
    
    // Если есть media_group, отправляем все медиафайлы в одной группе
    if let Some(media_group) = &message.media_group {
        info!("Sending media group with {} files to user {}", media_group.media.len(), telegram_id);
        info!("Media group details: {:?}", media_group);
        
        // Создаем единую медиагруппу со всеми файлами
        let mut is_first_item = true;
        
        for media_item in &media_group.media {
            info!("Processing media item: type={}, file_id={:?}, file_path={:?}", 
                  media_item.media_type, media_item.file_id, media_item.file_path);
            
            // Используем только валидный file_id
            let media_input = if let Some(file_id) = &media_item.file_id {
                info!("Using file_id: {}", file_id);
                teloxide::types::InputFile::file_id(teloxide::types::FileId(file_id.clone()))
            } else {
                info!("⚠️  WARNING: Skipping media item without valid file_id: {:?}", media_item.file_path);
                info!("⚠️  Files must be uploaded to Telegram first to get valid file_id");
                continue;
            };
            let input_media_item = match media_item.media_type.as_str() {
                "photo" => {
                    teloxide::types::InputMedia::Photo(teloxide::types::InputMediaPhoto {
                        media: media_input,
                        // Подпись только к первому элементу в медиагруппе
                        caption: create_media_caption(message, &media_item.caption, is_first_item),
                        parse_mode: None,
                        caption_entities: None,
                        has_spoiler: false,
                        show_caption_above_media: false,
                    })
                },
                "video" => {
                    teloxide::types::InputMedia::Video(teloxide::types::InputMediaVideo {
                        media: media_input,
                        // Подпись только к первому элементу в медиагруппе
                        caption: create_media_caption(message, &media_item.caption, is_first_item),
                        parse_mode: None,
                        caption_entities: None,
                        width: None,
                        height: None,
                        duration: None,
                        supports_streaming: None,
                        thumbnail: None,
                        cover: None,
                        start_timestamp: None,
                        show_caption_above_media: false,
                        has_spoiler: false,
                    })
                },
                "document" => {
                    teloxide::types::InputMedia::Document(teloxide::types::InputMediaDocument {
                        media: media_input,
                        // Подпись только к первому элементу в медиагруппе
                        caption: create_media_caption(message, &media_item.caption, is_first_item),
                        parse_mode: None,
                        caption_entities: None,
                        thumbnail: None,
                        disable_content_type_detection: None,
                    })
                },
                "audio" => {
                    teloxide::types::InputMedia::Audio(teloxide::types::InputMediaAudio {
                        media: media_input,
                        // Подпись только к первому элементу в медиагруппе
                        caption: create_media_caption(message, &media_item.caption, is_first_item),
                        parse_mode: None,
                        caption_entities: None,
                        duration: None,
                        performer: None,
                        title: None,
                        thumbnail: None,
                    })
                },
                "voice" => {
                    // Голосовые сообщения обрабатываем как аудио
                    teloxide::types::InputMedia::Audio(teloxide::types::InputMediaAudio {
                        media: media_input,
                        // Подпись только к первому элементу в медиагруппе
                        caption: create_media_caption(message, &media_item.caption, is_first_item),
                        parse_mode: None,
                        caption_entities: None,
                        duration: None,
                        performer: None,
                        title: None,
                        thumbnail: None,
                    })
                },
                _ => {
                    info!("Unsupported media type: {}", media_item.media_type);
                    continue;
                }
            };
            input_media.push(input_media_item);
            is_first_item = false;
        }
        
        // Отправляем единую медиагруппу, если есть файлы
        if !input_media.is_empty() {
            info!("Sending unified media group with {} files to user {}", input_media.len(), telegram_id);
            
            let result = bot.send_media_group(
                teloxide::types::ChatId(telegram_id),
                input_media,
            ).await;
            
            match result {
                Ok(_) => {
                    info!("✅ Media group sent successfully to user {}", telegram_id);
                    media_files_sent = true;
                }
                Err(e) => {
                    error!("❌ Failed to send media group to user {}: {}", telegram_id, e);
                    return Err(anyhow::Error::new(e));
                }
            }
        } else {
            info!("No media files to send for user {}", telegram_id);
            // Если есть медиагруппа, но нет валидных файлов - возвращаем ошибку
            error!("❌ Media group specified but no valid files to send for user {}", telegram_id);
            return Err(anyhow::anyhow!("Media group specified but no valid files to send. Files must be uploaded to Telegram first to get valid file_id."));
        }
    }
    
    // Отправляем текстовое сообщение только если НЕТ медиагруппы
    // Если есть медиагруппа, то либо медиафайлы отправлены успешно, либо возвращена ошибка
    let should_send_text_message = message.media_group.is_none();
    
    if should_send_text_message {
        let result = if let Some(core_logic::BroadcastMessageType::SignUp) = message.message_type {
            // Для сообщений о записи создаем inline клавиатуру
            let keyboard = teloxide::types::InlineKeyboardMarkup::new(vec![vec![
                teloxide::types::InlineKeyboardButton::new(
                    "Записаться",
                    teloxide::types::InlineKeyboardButtonKind::CallbackData("sign_up".to_string()),
                ),
            ]]);
            
            bot.send_message(
                teloxide::types::ChatId(telegram_id),
                &message.message,
            )
            .reply_markup(keyboard)
            .await
        } else {
            // Для обычных сообщений отправляем без клавиатуры
            bot.send_message(
                teloxide::types::ChatId(telegram_id),
                &message.message,
            ).await
        };

        match result {
            Ok(_) => {
                info!("✅ Message sent successfully to Telegram user {}", telegram_id);
                Ok(())
            }
            Err(e) => {
                error!("❌ Failed to send message to Telegram user {}: {}", telegram_id, e);
                Err(anyhow::Error::new(e))
            }
        }
    } else {
        // Если есть медиагруппа и медиафайлы были отправлены, сообщение уже отправлено как подпись к первому файлу
        info!("✅ Message sent as caption to media group for user {}", telegram_id);
        Ok(())
        }
}

// Функция для загрузки файла в Telegram
pub async fn upload_file_to_telegram(
    bot: &Bot,
    file_data: &[u8],
    filename: &str,
    mime_type: &str,
) -> Result<String, Error> {
    info!("Uploading file to Telegram: filename={}, mime_type={}", filename, mime_type);
    
    // Создаем InputFile из байтов
    let input_file = teloxide::types::InputFile::memory(file_data.to_vec());
    
    // Получаем Telegram ID администратора из переменной окружения
    let admin_telegram_id = std::env::var("ADMIN_TELEGRAM_ID")
        .map_err(|_| anyhow::anyhow!("ADMIN_TELEGRAM_ID environment variable not found"))?
        .parse::<i64>()
        .map_err(|_| anyhow::anyhow!("Invalid ADMIN_TELEGRAM_ID format"))?;
    
    let chat_id = teloxide::types::ChatId(admin_telegram_id);
    
    // Определяем тип файла по MIME типу
    let is_image = mime_type.starts_with("image/");
    let is_video = mime_type.starts_with("video/");
    let is_audio = mime_type.starts_with("audio/");
    
    let result = if is_image {
        // Загружаем как фото
        bot.send_photo(chat_id, input_file).await
    } else if is_video {
        // Загружаем как видео
        bot.send_video(chat_id, input_file).await
    } else if is_audio {
        // Загружаем как аудио
        bot.send_audio(chat_id, input_file).await
    } else {
        // Загружаем как документ
        bot.send_document(chat_id, input_file).await
    };
    
    match result {
        Ok(msg) => {
            let file_id = if is_image {
                msg.photo().unwrap().last().unwrap().file.id.clone()
            } else if is_video {
                msg.video().unwrap().file.id.clone()
            } else if is_audio {
                msg.audio().unwrap().file.id.clone()
            } else {
                msg.document().unwrap().file.id.clone()
            };
            info!("✅ File uploaded successfully: file_id={}", file_id);
            Ok(file_id.to_string())
        },
        Err(e) => {
            error!("❌ Failed to upload file: {}", e);
            Err(anyhow::Error::new(e))
        }
    }
}
