use lapin::{
    options::BasicAckOptions, options::BasicConsumeOptions, types::FieldTable, Channel, Connection,
    ConnectionProperties, Consumer,
};
use serde_json;
use std::time::Duration;
use teloxide::prelude::*;
use teloxide::types::{ParseMode, ChatId};
use tokio::time::timeout;
use tracing::{error, info, warn};
use uuid::Uuid;
use futures_util::StreamExt;
use sqlx::SqlitePool;

use core_logic::{BroadcastEvent, BroadcastMessage};

const EVENTS_QUEUE_NAME: &str = "broadcast_events";
const EVENTS_EXCHANGE_NAME: &str = "broadcast_events_exchange";
const BROADCAST_QUEUE_NAME: &str = "telegram_broadcast";
const BROADCAST_EXCHANGE_NAME: &str = "telegram_broadcast_exchange";

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Инициализируем логирование
    tracing_subscriber::fmt::init();
    
    // Загружаем переменные окружения
    dotenvy::dotenv().expect(".env file not found");

    info!("Starting Event-Driven broadcast worker...");

    // Инициализируем БД
    let pool = core_logic::db::init_db().await.expect("Failed to initialize database");

    // Подключаемся к RabbitMQ
    let rabbitmq_url = std::env::var("RABBITMQ_URL")
        .unwrap_or_else(|_| "amqp://localhost:5672".to_string());

    let conn = Connection::connect(
        &rabbitmq_url,
        ConnectionProperties::default()
            .with_connection_name("event_worker".into()),
    )
    .await?;

    let channel = conn.create_channel().await?;

    // Объявляем exchange и очередь для событий
    channel
        .exchange_declare(
            EVENTS_EXCHANGE_NAME,
            lapin::ExchangeKind::Fanout,
            lapin::options::ExchangeDeclareOptions::default(),
            lapin::types::FieldTable::default(),
        )
        .await?;

    channel
        .queue_declare(
            EVENTS_QUEUE_NAME,
            lapin::options::QueueDeclareOptions::default(),
            lapin::types::FieldTable::default(),
        )
        .await?;

    channel
        .queue_bind(
            EVENTS_QUEUE_NAME,
            EVENTS_EXCHANGE_NAME,
            "",
            lapin::options::QueueBindOptions::default(),
            lapin::types::FieldTable::default(),
        )
        .await?;

    // Объявляем exchange и очередь для сообщений
    channel
        .exchange_declare(
            BROADCAST_EXCHANGE_NAME,
            lapin::ExchangeKind::Direct,
            lapin::options::ExchangeDeclareOptions::default(),
            lapin::types::FieldTable::default(),
        )
        .await?;

    channel
        .queue_declare(
            BROADCAST_QUEUE_NAME,
            lapin::options::QueueDeclareOptions::default(),
            lapin::types::FieldTable::default(),
        )
        .await?;

    channel
        .queue_bind(
            BROADCAST_QUEUE_NAME,
            BROADCAST_EXCHANGE_NAME,
            "broadcast",
            lapin::options::QueueBindOptions::default(),
            lapin::types::FieldTable::default(),
        )
        .await?;

    // Настраиваем QoS для обработки одного сообщения за раз
    channel
        .basic_qos(1, lapin::options::BasicQosOptions::default())
        .await?;

    // Создаем consumer для событий
    let events_consumer = channel
        .basic_consume(
            EVENTS_QUEUE_NAME,
            "event_worker",
            BasicConsumeOptions::default(),
            FieldTable::default(),
        )
        .await?;

    info!("Event worker started, waiting for events...");

    // Обрабатываем события
    process_events(events_consumer, channel, &pool).await?;

    Ok(())
}

async fn process_events(
    mut consumer: Consumer,
    channel: Channel,
    pool: &SqlitePool,
) -> Result<(), Box<dyn std::error::Error>> {
    let bot = Bot::from_env();
    let worker_id = Uuid::new_v4().to_string();

    while let Some(delivery) = consumer.next().await {
        let delivery = match delivery {
            Ok(delivery) => delivery,
            Err(e) => {
                error!("Failed to receive event: {}", e);
                continue;
            }
        };

        let delivery_tag = delivery.delivery_tag;

        // Парсим событие
        let event: BroadcastEvent = match serde_json::from_slice(&delivery.data) {
            Ok(event) => event,
            Err(e) => {
                error!("Failed to parse event: {}", e);
                if let Err(e) = channel.basic_ack(delivery_tag, BasicAckOptions::default()).await {
                    error!("Failed to ack event: {}", e);
                }
                continue;
            }
        };

        info!("Processing event: {:?}", std::mem::discriminant(&event));

        // Обрабатываем событие
        let process_result = handle_event(&bot, &event, &worker_id, pool).await;

        match process_result {
            Ok(_) => {
                info!("Successfully processed event: {:?}", std::mem::discriminant(&event));
            }
            Err(e) => {
                error!("Failed to process event: {:?}: {}", std::mem::discriminant(&event), e);
            }
        }

        // Подтверждаем обработку события
        if let Err(e) = channel.basic_ack(delivery_tag, BasicAckOptions::default()).await {
            error!("Failed to ack event: {}", e);
        }

        // Небольшая задержка для избежания rate limiting
        tokio::time::sleep(Duration::from_millis(100)).await;
    }

    Ok(())
}

async fn handle_event(
    bot: &Bot,
    event: &BroadcastEvent,
    worker_id: &str,
    pool: &SqlitePool,
) -> Result<(), Box<dyn std::error::Error>> {
    match event {
        BroadcastEvent::BroadcastCreated { broadcast_id, message: _, target_users: _, .. } => {
            info!("Starting broadcast {}", broadcast_id);
            
            // Получаем пользователей из БД
            let users = match core_logic::db::get_users_for_broadcast(pool, false).await {
                Ok(users) => users,
                Err(e) => {
                    error!("Failed to get users for broadcast {}: {}", broadcast_id, e);
                    return Err(Box::new(e));
                }
            };
            
            info!("Broadcast {} will be sent to {} users", broadcast_id, users.len());
            
            // Получаем сообщение из БД
            let summary = match core_logic::db::get_broadcast_summary(pool, broadcast_id).await {
                Ok(Some(summary)) => summary,
                Ok(None) => {
                    error!("Broadcast summary not found for {}", broadcast_id);
                    return Err("Broadcast summary not found".into());
                }
                Err(e) => {
                    error!("Failed to get broadcast summary for {}: {}", broadcast_id, e);
                    return Err(Box::new(e));
                }
            };
            
            // Отправляем события начала рассылки
            let start_event = BroadcastEvent::BroadcastStarted {
                broadcast_id: broadcast_id.clone(),
                started_at: chrono::Utc::now(),
            };
            
            // Публикуем событие начала (в реальной системе это должно идти через RabbitMQ)
            info!("Broadcast {} started", broadcast_id);
            
            // Отправляем сообщения в очередь для обработки
            let mut sent_count = 0;
            let mut failed_count = 0;
            
            for user in users {
                if let Some(telegram_id) = user.telegram_id {
                    let broadcast_message = BroadcastMessage {
                        user_id: user.id,
                        telegram_id: Some(telegram_id),
                        message: summary.message.clone(),
                        broadcast_id: broadcast_id.clone(),
                        created_at: chrono::Utc::now(),
                    };
                    
                    // В реальной системе здесь нужно отправить в очередь сообщений
                    // Для простоты отправляем напрямую
                    let send_result = send_telegram_message(bot, &broadcast_message).await;
                    
                    match send_result {
                        Ok(_) => {
                            info!("Sent message to user {} (broadcast: {})", user.id, broadcast_id);
                            sent_count += 1;
                            
                            // Обновляем статус сообщения в БД
                            if let Err(e) = update_message_status(pool, &broadcast_message, true, None).await {
                                error!("Failed to update message status: {}", e);
                            }
                        }
                        Err(e) => {
                            error!("Failed to send message to user {} (broadcast: {}): {}", user.id, broadcast_id, e);
                            failed_count += 1;
                            
                            // Обновляем статус сообщения в БД
                            if let Err(e) = update_message_status(pool, &broadcast_message, false, Some(e.to_string())).await {
                                error!("Failed to update message status: {}", e);
                            }
                        }
                    }
                    
                    // Задержка между сообщениями
                    tokio::time::sleep(Duration::from_millis(200)).await;
                }
            }
            
            // Обновляем статус рассылки в БД
            info!("Updating broadcast {} status: sent={}, failed={}", broadcast_id, sent_count, failed_count);
            if let Err(e) = update_broadcast_status(pool, broadcast_id, sent_count, failed_count).await {
                error!("Failed to update broadcast status: {}", e);
            } else {
                info!("Successfully updated broadcast {} status to completed", broadcast_id);
            }
        }
        
        BroadcastEvent::MessageSent { broadcast_id, user_id, telegram_id, .. } => {
            info!("Message sent to user {} (broadcast: {})", user_id, broadcast_id);
        }
        
        BroadcastEvent::MessageFailed { broadcast_id, user_id, telegram_id, error, .. } => {
            warn!("Message failed for user {} (broadcast: {}): {}", user_id, broadcast_id, error);
        }
        
        BroadcastEvent::MessageRetrying { broadcast_id, user_id, telegram_id, retry_count, .. } => {
            info!("Retrying message for user {} (broadcast: {}, attempt: {})", user_id, broadcast_id, retry_count);
        }
        
        BroadcastEvent::BroadcastCompleted { broadcast_id, total_sent, total_failed, .. } => {
            info!("Broadcast {} completed: {} sent, {} failed", broadcast_id, total_sent, total_failed);
        }
        
        BroadcastEvent::BroadcastStarted { broadcast_id, .. } => {
            info!("Broadcast {} started", broadcast_id);
        }
    }

    Ok(())
}

async fn send_telegram_message(
    bot: &Bot,
    message: &BroadcastMessage,
) -> Result<(), Box<dyn std::error::Error>> {
    if let Some(telegram_id) = message.telegram_id {
        let timeout_duration = Duration::from_secs(10);
        
        let send_result = timeout(
            timeout_duration,
            bot.send_message(ChatId(telegram_id), &message.message)
                .parse_mode(ParseMode::Html)
        )
        .await;

        match send_result {
            Ok(Ok(_)) => Ok(()),
            Ok(Err(e)) => {
                warn!("Telegram API error: {}", e);
                Err(Box::new(e))
            }
            Err(_) => {
                warn!("Timeout sending message to {}", telegram_id);
                Err("Send timeout".into())
            }
        }
    } else {
        Err("No telegram_id provided".into())
    }
}

async fn update_message_status(
    pool: &SqlitePool,
    message: &BroadcastMessage,
    success: bool,
    error: Option<String>,
) -> Result<(), Box<dyn std::error::Error>> {
    let status = if success { 
        core_logic::MessageStatus::Sent.to_string() 
    } else { 
        core_logic::MessageStatus::Failed.to_string() 
    };
    let sent_at = if success { Some(chrono::Utc::now().naive_utc()) } else { None };
    
    sqlx::query!(
        "UPDATE broadcast_messages 
         SET status = ?, error = ?, sent_at = ? 
         WHERE broadcast_id = ? AND user_id = ?",
        status,
        error,
        sent_at,
        message.broadcast_id,
        message.user_id
    )
    .execute(pool)
    .await?;

    Ok(())
}

async fn update_broadcast_status(
    pool: &SqlitePool,
    broadcast_id: &str,
    sent_count: u32,
    failed_count: u32,
) -> Result<(), Box<dyn std::error::Error>> {
    let status = core_logic::BroadcastStatus::Completed.to_string();
    let completed_at = chrono::Utc::now().naive_utc();
    let sent_count_i64 = sent_count as i64;
    let failed_count_i64 = failed_count as i64;
    let pending_count_i64 = 0i64; // Все сообщения обработаны
    
    info!("Executing SQL update for broadcast {}: status={}, sent={}, failed={}, pending={}", 
          broadcast_id, status, sent_count_i64, failed_count_i64, pending_count_i64);
    
    let result = sqlx::query!(
        "UPDATE broadcast_summaries 
         SET status = ?, sent_count = ?, failed_count = ?, pending_count = ?, completed_at = ? 
         WHERE id = ?",
        status,
        sent_count_i64,
        failed_count_i64,
        pending_count_i64,
        completed_at,
        broadcast_id
    )
    .execute(pool)
    .await?;

    info!("SQL update result: {} rows affected", result.rows_affected());
    
    Ok(())
}
