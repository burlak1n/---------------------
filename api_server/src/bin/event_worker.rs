use tracing::{error, info};
use sqlx::SqlitePool;

use core_logic::{BroadcastEvent, BroadcastMessage, MessageStatus, EventsWorker, RabbitMQClient};
use anyhow::Error;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Инициализируем логирование
    tracing_subscriber::fmt::init();
    
    // Загружаем переменные окружения
    dotenvy::dotenv().expect(".env file not found");

    info!("Starting Event-Driven broadcast worker...");

    // Инициализируем БД
    let pool = core_logic::db::init_db().await.expect("Failed to initialize database");

    // Создаем RabbitMQ клиент
    let rabbitmq_client = RabbitMQClient::new().await?;

    info!("🚀 Event worker started successfully!");
    info!("Configuration:");
    info!("  - Database: SQLite");
    info!("  - RabbitMQ: Connected");

    // Создаем воркер для обработки событий
    let events_worker = EventsWorker::new().await?;

    // Запускаем обработку событий
    events_worker.start_processing("event_worker", move |event| {
        let pool = pool.clone();
        let rabbitmq_client = rabbitmq_client.clone();
        
        async move {
            handle_broadcast_event(event, &pool, &rabbitmq_client).await
        }
    }).await?;

    Ok(())
}

async fn handle_broadcast_event(
    event: BroadcastEvent,
    pool: &SqlitePool,
    rabbitmq_client: &RabbitMQClient,
) -> Result<(), Error> {
    info!("=== PROCESSING BROADCAST EVENT ===");
    info!("Event type: {:?}", event);

    match event {
        BroadcastEvent::BroadcastCreated { broadcast_id, message, target_users, created_at } => {
            info!("Processing BroadcastCreated event for broadcast: {}", broadcast_id);
            
            // Получаем пользователей для рассылки
            let users = if target_users.is_empty() {
                core_logic::db::get_users_for_broadcast(pool, false).await?
            } else {
                target_users
            };

            info!("Found {} users for broadcast", users.len());

            // Создаем сообщения для каждого пользователя
            for user in users {
                let message_record = BroadcastMessage {
                    broadcast_id: broadcast_id.clone(),
                    user_id: user.id,
                    telegram_id: user.telegram_id,
                    message: message.clone(),
                    message_type: None,
                    created_at,
                };

                // Создаем запись сообщения в БД
                let message_db_record = core_logic::BroadcastMessageRecord {
                    id: 0, // Будет заполнено БД
                    broadcast_id: message_record.broadcast_id.clone(),
                    user_id: message_record.user_id,
                    telegram_id: message_record.telegram_id,
                    status: MessageStatus::Pending,
                    error: None,
                    sent_at: None,
                    retry_count: 0,
                    message_type: message_record.message_type.clone(),
                    created_at: chrono::Utc::now().naive_utc(),
                };

                // Сохраняем сообщение в БД
                core_logic::db::create_broadcast_message(pool, &message_db_record).await?;

                // Отправляем сообщение в RabbitMQ
                    info!("Publishing message to RabbitMQ for user {} in broadcast {}", user.id, broadcast_id);
                match rabbitmq_client.publish_message(&message_record).await {
                        Ok(_) => {
                        info!("✅ Message published to RabbitMQ successfully");
                        }
                        Err(e) => {
                        let error_msg = format!("Failed to publish to RabbitMQ: {}", e);
                        error!("{}", error_msg);
                        
                        // Обновляем статус на failed
                        core_logic::db::update_broadcast_message_status(
                            pool,
                            &message_record.broadcast_id,
                            &message_record.user_id,
                            MessageStatus::Failed,
                            Some(error_msg),
                        ).await?;
                    }
                }
            }

            // Обновляем статус рассылки
            core_logic::db::update_broadcast_status(
                pool,
                &broadcast_id,
                core_logic::BroadcastStatus::InProgress as u32,
                0, // version
            ).await?;

            info!("✅ BroadcastCreated event processed successfully");
        }
        BroadcastEvent::BroadcastStarted { .. } => {
            info!("BroadcastStarted event - no action needed");
        }
        BroadcastEvent::MessageSent { .. } => {
            info!("MessageSent event - no action needed");
        }
        BroadcastEvent::MessageFailed { .. } => {
            info!("MessageFailed event - no action needed");
        }
        BroadcastEvent::MessageRetrying { .. } => {
            info!("MessageRetrying event - no action needed");
        }
        BroadcastEvent::BroadcastCompleted { .. } => {
            info!("BroadcastCompleted event - no action needed");
        }
    }

    Ok(())
}




