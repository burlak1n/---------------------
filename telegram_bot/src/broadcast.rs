use lapin::{
    options::BasicAckOptions, options::BasicConsumeOptions, types::FieldTable, Channel, Connection,
    ConnectionProperties, Consumer,
};
use serde_json;
use std::time::Duration;
use teloxide::prelude::*;
use tracing::{error, info};
use futures_util::StreamExt;
use std::sync::Arc;
use sqlx::SqlitePool;
use core_logic::{BroadcastMessage, MessageStatus};

const BROADCAST_QUEUE_NAME: &str = "telegram_broadcast";
const BROADCAST_EXCHANGE_NAME: &str = "telegram_broadcast_exchange";

pub async fn broadcast_worker(bot: Bot, pool: Arc<SqlitePool>) -> Result<(), Box<dyn std::error::Error>> {
    info!("Starting broadcast worker...");

    // Подключаемся к RabbitMQ
    let rabbitmq_url = std::env::var("RABBITMQ_URL")
        .unwrap_or_else(|_| "amqp://localhost:5672".to_string());

    let conn = Connection::connect(
        &rabbitmq_url,
        ConnectionProperties::default()
            .with_connection_name("telegram_broadcast_worker".into()),
    )
    .await?;

    let channel = conn.create_channel().await?;

    // Объявляем exchange и очередь
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

    // Настраиваем QoS
    channel
        .basic_qos(1, lapin::options::BasicQosOptions::default())
        .await?;

    // Создаем consumer
    let consumer = channel
        .basic_consume(
            BROADCAST_QUEUE_NAME,
            "telegram_broadcast_worker",
            BasicConsumeOptions::default(),
            FieldTable::default(),
        )
        .await?;

    info!("🚀 Broadcast worker started successfully!");
    info!("Waiting for broadcast messages...");

    // Обрабатываем сообщения
    process_broadcast_messages(consumer, channel, bot, &pool).await?;

    Ok(())
}

async fn process_broadcast_messages(
    mut consumer: Consumer,
    channel: Channel,
    bot: Bot,
    pool: &Arc<SqlitePool>,
) -> Result<(), Box<dyn std::error::Error>> {
    info!("🎯 Starting broadcast message processing loop");

    while let Some(delivery) = consumer.next().await {
        let delivery = match delivery {
            Ok(delivery) => {
                info!("✅ Broadcast message received, tag: {}", delivery.delivery_tag);
                delivery
            }
            Err(e) => {
                error!("❌ Failed to receive broadcast message: {}", e);
                continue;
            }
        };

        let delivery_tag = delivery.delivery_tag;

        // Парсим сообщение
        let broadcast_message: BroadcastMessage = match serde_json::from_slice(&delivery.data) {
            Ok(message) => message,
            Err(e) => {
                error!("Failed to parse broadcast message: {}", e);
                if let Err(e) = channel.basic_ack(delivery_tag, BasicAckOptions::default()).await {
                    error!("Failed to ack broadcast message: {}", e);
                }
                continue;
            }
        };

        info!("=== PROCESSING BROADCAST MESSAGE ===");
        info!("User ID: {}", broadcast_message.user_id);
        info!("Broadcast ID: {}", broadcast_message.broadcast_id);
        info!("Telegram ID: {:?}", broadcast_message.telegram_id);

        // Отправляем сообщение в Telegram
        let send_result = send_telegram_message(&bot, &broadcast_message).await;

        match send_result {
            Ok(_) => {
                info!("✅ Successfully sent message to user {}", broadcast_message.user_id);
                
                // Обновляем статус на "sent"
                if let Err(e) = core_logic::db::update_broadcast_message_status(
                    pool,
                    &broadcast_message.broadcast_id,
                    &broadcast_message.user_id,
                    MessageStatus::Sent,
                    None,
                ).await {
                    error!("Failed to update message status to sent: {}", e);
                }
            }
            Err(e) => {
                error!("❌ Failed to send message to user {}: {}", broadcast_message.user_id, e);
                
                // Обновляем статус на "failed"
                if let Err(e) = core_logic::db::update_broadcast_message_status(
                    pool,
                    &broadcast_message.broadcast_id,
                    &broadcast_message.user_id,
                    MessageStatus::Failed,
                    Some(e.to_string()),
                ).await {
                    error!("Failed to update message status to failed: {}", e);
                }
            }
        }

        // Подтверждаем обработку
        if let Err(e) = channel.basic_ack(delivery_tag, BasicAckOptions::default()).await {
            error!("❌ Failed to ack broadcast message: {}", e);
        } else {
            info!("✅ Broadcast message acknowledged successfully");
        }

        // Небольшая задержка
        tokio::time::sleep(Duration::from_millis(100)).await;
    }

    info!("🛑 Broadcast message processing loop ended");
    Ok(())
}

async fn send_telegram_message(
    bot: &Bot,
    message: &BroadcastMessage,
) -> Result<(), Box<dyn std::error::Error>> {
    if let Some(telegram_id) = message.telegram_id {
        info!("Sending message to Telegram user {}", telegram_id);
        
        let result = bot.send_message(
            teloxide::types::ChatId(telegram_id),
            &message.message,
        ).await;

        match result {
            Ok(_) => {
                info!("✅ Message sent successfully to Telegram user {}", telegram_id);
                Ok(())
            }
            Err(e) => {
                error!("❌ Failed to send message to Telegram user {}: {}", telegram_id, e);
                Err(Box::new(e))
            }
        }
    } else {
        error!("No telegram_id provided for user {}", message.user_id);
        Err("No telegram_id provided".into())
    }
}
