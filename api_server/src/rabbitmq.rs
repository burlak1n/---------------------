use lapin::{
    options::BasicPublishOptions, BasicProperties, Channel, Connection, ConnectionProperties,
};
use serde_json;
use std::time::Duration;
use tokio::time::timeout;
use tracing::{error, info, warn};
use uuid::Uuid;

use core_logic::{BroadcastMessage, BroadcastResult, User, BroadcastEvent};

const BROADCAST_QUEUE_NAME: &str = "telegram_broadcast";
const BROADCAST_EXCHANGE_NAME: &str = "telegram_broadcast_exchange";
const EVENTS_QUEUE_NAME: &str = "broadcast_events";
const EVENTS_EXCHANGE_NAME: &str = "broadcast_events_exchange";

pub struct RabbitMQClient {
    channel: Channel,
}

impl RabbitMQClient {
    pub async fn new() -> Result<Self, Box<dyn std::error::Error>> {
        // Получаем URL RabbitMQ из переменных окружения
        let rabbitmq_url = std::env::var("RABBITMQ_URL")
            .unwrap_or_else(|_| "amqp://localhost:5672".to_string());

        // Подключаемся к RabbitMQ
        let conn = Connection::connect(
            &rabbitmq_url,
            ConnectionProperties::default()
                .with_connection_name("api_server".into()),
        )
        .await?;

        let channel = conn.create_channel().await?;

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

        info!("Connected to RabbitMQ successfully");
        Ok(RabbitMQClient { channel })
    }

    // Отправка события в очередь событий
    pub async fn publish_event(
        &self,
        event: &BroadcastEvent,
    ) -> Result<(), Box<dyn std::error::Error>> {
        let payload = serde_json::to_vec(event)?;

        let timeout_duration = Duration::from_secs(5);
        let publish_result = timeout(
            timeout_duration,
            self.channel.basic_publish(
                EVENTS_EXCHANGE_NAME,
                "",
                BasicPublishOptions::default(),
                &payload,
                BasicProperties::default(),
            ),
        )
        .await;

        match publish_result {
            Ok(Ok(_)) => {
                info!("Published event: {:?}", std::mem::discriminant(event));
                Ok(())
            }
            Ok(Err(e)) => {
                warn!("Failed to publish event: {}", e);
                Err(Box::new(e))
            }
            Err(_) => {
                warn!("Timeout publishing event");
                Err("Publish timeout".into())
            }
        }
    }

    // Отправка сообщения в очередь сообщений (для обратной совместимости)
    pub async fn send_message_to_queue(
        &self,
        message: &BroadcastMessage,
    ) -> Result<(), Box<dyn std::error::Error>> {
        let payload = serde_json::to_vec(message)?;

        let timeout_duration = Duration::from_secs(5);
        let publish_result = timeout(
            timeout_duration,
            self.channel.basic_publish(
                BROADCAST_EXCHANGE_NAME,
                "broadcast",
                BasicPublishOptions::default(),
                &payload,
                BasicProperties::default(),
            ),
        )
        .await;

        match publish_result {
            Ok(Ok(_)) => Ok(()),
            Ok(Err(e)) => {
                warn!("Failed to publish message: {}", e);
                Err(Box::new(e))
            }
            Err(_) => {
                warn!("Timeout publishing message");
                Err("Publish timeout".into())
            }
        }
    }

    // Старый метод для обратной совместимости
    pub async fn send_broadcast(
        &self,
        users: Vec<User>,
        message: String,
    ) -> Result<BroadcastResult, Box<dyn std::error::Error>> {
        let broadcast_id = Uuid::new_v4().to_string();
        let mut sent_count = 0;
        let mut failed_count = 0;
        let mut errors = Vec::new();

        info!("Starting broadcast {} to {} users", broadcast_id, users.len());

        let total_users = users.len();
        for user in users {
            let broadcast_message = BroadcastMessage {
                user_id: user.id,
                telegram_id: user.telegram_id,
                message: message.clone(),
                broadcast_id: broadcast_id.clone(),
                created_at: chrono::Utc::now(),
            };

            match self.send_message_to_queue(&broadcast_message).await {
                Ok(_) => {
                    sent_count += 1;
                    if sent_count % 10 == 0 {
                        info!("Sent {} messages for broadcast {}", sent_count, broadcast_id);
                    }
                }
                Err(e) => {
                    failed_count += 1;
                    errors.push(format!("Failed to send to user {}: {}", user.id, e));
                    error!("Failed to send message to user {}: {}", user.id, e);
                }
            }

            // Небольшая задержка для избежания перегрузки
            tokio::time::sleep(Duration::from_millis(10)).await;
        }

        let result = BroadcastResult {
            broadcast_id,
            total_users,
            sent_count,
            failed_count,
            errors,
            completed_at: chrono::Utc::now(),
        };

        info!(
            "Broadcast completed: {} sent, {} failed",
            result.sent_count, result.failed_count
        );

        Ok(result)
    }
}
