use lapin::{
    options::BasicAckOptions, options::BasicConsumeOptions, types::FieldTable, Channel, Connection,
    ConnectionProperties, Consumer,
};
use lapin::protocol::basic::AMQPProperties;
use serde_json;
use std::time::Duration;
use teloxide::prelude::*;
use tracing::{error, info, warn};
use uuid::Uuid;
use futures_util::StreamExt;
use sqlx::SqlitePool;

use core_logic::{BroadcastEvent, BroadcastMessage, BroadcastMessageRecord, MessageStatus};

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

    info!("🚀 Event worker started successfully!");
    info!("Worker configuration:");
    info!("  - Events queue: {}", EVENTS_QUEUE_NAME);
    info!("  - Broadcast queue: {}", BROADCAST_QUEUE_NAME);
    info!("  - RabbitMQ URL: {}", rabbitmq_url);
    info!("Waiting for events...");

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
    
    info!("🎯 Starting event processing loop");
    info!("Worker ID: {}", worker_id);
    info!("Bot token loaded: {}", if !bot.token().is_empty() { "✅" } else { "❌" });

    info!("🔄 Starting event consumption loop...");
    while let Some(delivery) = consumer.next().await {
        info!("📨 Received delivery from RabbitMQ");
        let delivery = match delivery {
            Ok(delivery) => {
                info!("✅ Delivery received successfully, tag: {}", delivery.delivery_tag);
                delivery
            }
            Err(e) => {
                error!("❌ Failed to receive event: {}", e);
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

        info!("=== PROCESSING EVENT ===");
        info!("Event type: {:?}", std::mem::discriminant(&event));
        info!("Event data: {:?}", event);
        info!("Worker ID: {}", worker_id);

        // Обрабатываем событие
        info!("Calling handle_event for event type: {:?}", std::mem::discriminant(&event));
        let process_result = handle_event(&bot, &event, &worker_id, pool, &channel).await;

        match process_result {
            Ok(_) => {
                info!("✅ Successfully processed event: {:?}", std::mem::discriminant(&event));
            }
            Err(e) => {
                error!("❌ Failed to process event: {:?}: {}", std::mem::discriminant(&event), e);
            }
        }
        
        info!("=== EVENT PROCESSING COMPLETE ===");

        // Подтверждаем обработку события
        info!("Sending ACK for delivery tag: {}", delivery_tag);
        if let Err(e) = channel.basic_ack(delivery_tag, BasicAckOptions::default()).await {
            error!("❌ Failed to ack event: {}", e);
        } else {
            info!("✅ Event acknowledged successfully");
        }

        // Небольшая задержка для избежания rate limiting
        info!("⏳ Waiting 100ms before next event...");
        tokio::time::sleep(Duration::from_millis(100)).await;
    }

    info!("🛑 Event processing loop ended");
    Ok(())
}

async fn handle_event(
    _bot: &Bot,
    event: &BroadcastEvent,
    _worker_id: &str,
    pool: &SqlitePool,
    channel: &Channel,
) -> Result<(), Box<dyn std::error::Error>> {
    match event {
        BroadcastEvent::BroadcastCreated { broadcast_id, message: _, target_users: _, .. } => {
            info!("=== STARTING BROADCAST {} ===", broadcast_id);
            info!("Event worker {} processing broadcast creation", _worker_id);
            
            // Получаем пользователей из БД
            let users = match core_logic::db::get_users_for_broadcast(pool, false).await {
                Ok(users) => users,
                Err(e) => {
                    error!("Failed to get users for broadcast {}: {}", broadcast_id, e);
                    return Err(Box::new(e));
                }
            };
            
            info!("Broadcast {} will be sent to {} users", broadcast_id, users.len());
            info!("Users: {:?}", users.iter().map(|u| (u.id, u.telegram_id)).collect::<Vec<_>>());
            
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
            let _start_event = BroadcastEvent::BroadcastStarted {
                broadcast_id: broadcast_id.clone(),
                started_at: chrono::Utc::now(),
            };
            
            // Публикуем событие начала (в реальной системе это должно идти через RabbitMQ)
            info!("Broadcast {} started", broadcast_id);
            
            // Создаем записи сообщений в БД и отправляем в очередь
            let mut queued_count = 0;
            let mut failed_count = 0;
            
            for user in users {
                if let Some(telegram_id) = user.telegram_id {
                    info!("Processing user {} (telegram_id: {}) for broadcast {}", user.id, telegram_id, broadcast_id);
                    
                    // Определяем тип сообщения по содержимому
                    let message_type = if summary.message.contains("записаться на собеседование") || 
                                       summary.message.contains("🎉 Поздравляем") {
                        Some(core_logic::BroadcastMessageType::SignUp)
                    } else {
                        Some(core_logic::BroadcastMessageType::Custom)
                    };
                    
                    let broadcast_message = BroadcastMessage {
                        user_id: user.id,
                        telegram_id: Some(telegram_id),
                        message: summary.message.clone(),
                        broadcast_id: broadcast_id.clone(),
                        message_type,
                        created_at: chrono::Utc::now(),
                    };
                    
                    // Отправляем сообщение в очередь для telegram-бота
                    info!("Publishing message to RabbitMQ for user {} in broadcast {}", user.id, broadcast_id);
                    let publish_result = publish_broadcast_message(channel, &broadcast_message).await;
                    
                    match publish_result {
                        Ok(_) => {
                            info!("✅ Successfully queued message for user {} (broadcast: {})", user.id, broadcast_id);
                            queued_count += 1;
                        }
                        Err(e) => {
                            error!("❌ Failed to queue message for user {} (broadcast: {}): {}", user.id, broadcast_id, e);
                            failed_count += 1;
                            
                            // Обновляем статус на "failed" если не удалось отправить в очередь
                            info!("Updating message status to failed for user {} in broadcast {}", user.id, broadcast_id);
                            if let Err(e) = core_logic::db::update_broadcast_message_status(pool, &broadcast_message.broadcast_id, &broadcast_message.user_id, core_logic::MessageStatus::Failed, Some(e.to_string())).await {
                                error!("Failed to update message status: {}", e);
                            }
                        }
                    }
                }
            }
            
            // Обновляем статус рассылки в БД - устанавливаем InProgress
            info!("=== BROADCAST {} PROCESSING COMPLETE ===", broadcast_id);
            info!("Final counts: queued={}, failed={}", queued_count, failed_count);
            info!("Updating broadcast {} status to InProgress", broadcast_id);
            
            // Получаем текущую сводку и обновляем статус на InProgress
            if let Ok(Some(mut summary)) = core_logic::db::get_broadcast_summary(pool, broadcast_id).await {
                summary.status = core_logic::BroadcastStatus::InProgress;
                summary.started_at = Some(chrono::Utc::now().naive_utc());
                
                if let Err(e) = core_logic::db::update_broadcast_summary(pool, &summary).await {
                    error!("❌ Failed to update broadcast status: {}", e);
                } else {
                    info!("✅ Successfully updated broadcast {} status to InProgress", broadcast_id);
                }
            }
            
            // НЕ устанавливаем статус Completed здесь - он будет установлен автоматически
            // когда все сообщения будут обработаны telegram_bot
            
            info!("=== BROADCAST {} FINISHED ===", broadcast_id);
        }
        
        BroadcastEvent::MessageSent { broadcast_id, user_id, .. } => {
            info!("Message sent to user {} (broadcast: {})", user_id, broadcast_id);
        }
        
        BroadcastEvent::MessageFailed { broadcast_id, user_id, error, .. } => {
            warn!("Message failed for user {} (broadcast: {}): {}", user_id, broadcast_id, error);
        }
        
        BroadcastEvent::MessageRetrying { broadcast_id, user_id, retry_count, .. } => {
            info!("Retrying message for user {} (broadcast: {}, attempt: {})", user_id, broadcast_id, retry_count);
        }
        
        BroadcastEvent::BroadcastCompleted { broadcast_id, total_sent, total_failed, .. } => {
            info!("Broadcast {} completed: {} sent, {} failed", broadcast_id, total_sent, total_failed);
        }
        
        BroadcastEvent::BroadcastStarted { broadcast_id, .. } => {
            info!("Broadcast {} started", broadcast_id);
        }
    }

    info!("✅ handle_event completed successfully");
    Ok(())
}

async fn publish_broadcast_message(
    channel: &Channel,
    message: &BroadcastMessage,
) -> Result<(), Box<dyn std::error::Error>> {
    info!("Publishing message to RabbitMQ: user_id={}, broadcast_id={}", message.user_id, message.broadcast_id);
    
    let message_json = serde_json::to_vec(message)?;
    info!("Message JSON size: {} bytes", message_json.len());
    
    let result = channel
        .basic_publish(
            BROADCAST_EXCHANGE_NAME,
            "broadcast",
            lapin::options::BasicPublishOptions::default(),
            &message_json,
            AMQPProperties::default(),
        )
        .await;
    
    match result {
        Ok(_) => {
            info!("✅ Message published to RabbitMQ successfully");
            Ok(())
        }
        Err(e) => {
            error!("❌ Failed to publish message to RabbitMQ: {}", e);
            Err(Box::new(e))
        }
    }
}




