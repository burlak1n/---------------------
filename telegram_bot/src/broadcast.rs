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

async fn send_telegram_message(
    bot: &Bot,
    message: &BroadcastMessage,
) -> Result<(), Error> {
    let telegram_id = message.telegram_id;
        info!("Sending message to Telegram user {}", telegram_id);
        
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
}
