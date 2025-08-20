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
use futures_util::StreamExt;

use core_logic::BroadcastMessage;

const QUEUE_NAME: &str = "telegram_broadcast";
const EXCHANGE_NAME: &str = "telegram_broadcast_exchange";

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Инициализируем логирование
    tracing_subscriber::fmt::init();
    
    // Загружаем переменные окружения
    dotenvy::dotenv().expect(".env file not found");

    info!("Starting Telegram broadcast worker...");

    // Подключаемся к RabbitMQ
    let rabbitmq_url = std::env::var("RABBITMQ_URL")
        .unwrap_or_else(|_| "amqp://localhost:5672".to_string());

    let conn = Connection::connect(
        &rabbitmq_url,
        ConnectionProperties::default()
            .with_connection_name("telegram_worker".into()),
    )
    .await?;

    let channel = conn.create_channel().await?;

    // Объявляем exchange и очередь
    channel
        .exchange_declare(
            EXCHANGE_NAME,
            lapin::ExchangeKind::Direct,
            lapin::options::ExchangeDeclareOptions::default(),
            lapin::types::FieldTable::default(),
        )
        .await?;

    channel
        .queue_declare(
            QUEUE_NAME,
            lapin::options::QueueDeclareOptions::default(),
            lapin::types::FieldTable::default(),
        )
        .await?;

    channel
        .queue_bind(
            QUEUE_NAME,
            EXCHANGE_NAME,
            "broadcast",
            lapin::options::QueueBindOptions::default(),
            lapin::types::FieldTable::default(),
        )
        .await?;

    // Настраиваем QoS для обработки одного сообщения за раз
    channel
        .basic_qos(1, lapin::options::BasicQosOptions::default())
        .await?;

    // Создаем consumer
    let consumer = channel
        .basic_consume(
            QUEUE_NAME,
            "telegram_worker",
            BasicConsumeOptions::default(),
            FieldTable::default(),
        )
        .await?;

    info!("Worker started, waiting for messages...");

    // Обрабатываем сообщения
    process_messages(consumer, channel).await?;

    Ok(())
}

async fn process_messages(
    mut consumer: Consumer,
    channel: Channel,
) -> Result<(), Box<dyn std::error::Error>> {
    let bot = Bot::from_env();

    while let Some(delivery) = consumer.next().await {
        let delivery = match delivery {
            Ok(delivery) => delivery,
            Err(e) => {
                error!("Failed to receive message: {}", e);
                continue;
            }
        };

        let delivery_tag = delivery.delivery_tag;

        // Парсим сообщение
        let broadcast_message: BroadcastMessage = match serde_json::from_slice(&delivery.data) {
            Ok(msg) => msg,
            Err(e) => {
                error!("Failed to parse message: {}", e);
                if let Err(e) = channel.basic_ack(delivery_tag, BasicAckOptions::default()).await {
                    error!("Failed to ack message: {}", e);
                }
                continue;
            }
        };

        info!(
            "Processing message for user {} (broadcast: {})",
            broadcast_message.user_id, broadcast_message.broadcast_id
        );

        // Отправляем сообщение через Telegram
        let send_result = send_telegram_message(&bot, &broadcast_message).await;

        match send_result {
            Ok(_) => {
                info!(
                    "Successfully sent message to user {} (broadcast: {})",
                    broadcast_message.user_id, broadcast_message.broadcast_id
                );
            }
            Err(e) => {
                error!(
                    "Failed to send message to user {} (broadcast: {}): {}",
                    broadcast_message.user_id, broadcast_message.broadcast_id, e
                );
            }
        }

        // Подтверждаем обработку сообщения
        if let Err(e) = channel.basic_ack(delivery_tag, BasicAckOptions::default()).await {
            error!("Failed to ack message: {}", e);
        }

        // Небольшая задержка для избежания rate limiting
        tokio::time::sleep(Duration::from_millis(100)).await;
    }

    Ok(())
}

async fn send_telegram_message(
    bot: &Bot,
    message: &BroadcastMessage,
) -> Result<(), Box<dyn std::error::Error>> {
    let telegram_id = match message.telegram_id {
        Some(id) => id,
        None => {
            warn!(
                "User {} has no Telegram ID, skipping message",
                message.user_id
            );
            return Ok(());
        }
    };

    // Отправляем сообщение с таймаутом
    let timeout_duration = Duration::from_secs(10);
    let send_result = timeout(
        timeout_duration,
        bot.send_message(ChatId(telegram_id), &message.message)
            .parse_mode(ParseMode::Html),
    )
    .await;

    match send_result {
        Ok(Ok(_)) => Ok(()),
        Ok(Err(e)) => {
            error!("Telegram API error: {}", e);
            Err(Box::new(e))
        }
        Err(_) => {
            error!("Timeout sending message to user {}", message.user_id);
            Err("Send timeout".into())
        }
    }
}
