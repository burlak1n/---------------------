use lapin::{
    options::{BasicAckOptions, BasicConsumeOptions, BasicPublishOptions, BasicQosOptions},
    types::FieldTable, Channel, Connection, ConnectionProperties, Consumer,
};
use serde_json;
use std::time::Duration;
use tracing::{error, info};
use futures_util::StreamExt;
use std::sync::Arc;

use crate::{BroadcastEvent, BroadcastMessage};
use anyhow::Error;

// Константы для очередей и exchange'ов
pub const BROADCAST_QUEUE_NAME: &str = "telegram_broadcast";
pub const BROADCAST_EXCHANGE_NAME: &str = "telegram_broadcast_exchange";
pub const EVENTS_QUEUE_NAME: &str = "broadcast_events";
pub const EVENTS_EXCHANGE_NAME: &str = "broadcast_events_exchange";

/// Клиент для работы с RabbitMQ
#[derive(Clone)]
pub struct RabbitMQClient {
    channel: Arc<Channel>,
}

impl RabbitMQClient {
    /// Создает новый клиент RabbitMQ
    pub async fn new() -> Result<Self, Error> {
        let rabbitmq_url = std::env::var("RABBITMQ_URL")
            .unwrap_or_else(|_| "amqp://localhost:5672".to_string());

        let conn = Connection::connect(
            &rabbitmq_url,
            ConnectionProperties::default()
                .with_connection_name("rabbitmq_client".into()),
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
        Ok(RabbitMQClient { channel: Arc::new(channel) })
    }

    /// Публикует событие в очередь событий
    pub async fn publish_event(
        &self,
        event: &BroadcastEvent,
    ) -> Result<(), Error> {
        let event_json = serde_json::to_vec(event)?;

        self.channel
            .basic_publish(
                EVENTS_EXCHANGE_NAME,
                "",
                BasicPublishOptions::default(),
                &event_json,
                lapin::BasicProperties::default(),
            )
            .await?;

        info!("Event published to RabbitMQ: {:?}", event);
        Ok(())
    }

    /// Публикует сообщение в очередь сообщений
    pub async fn publish_message(
        &self,
        message: &BroadcastMessage,
    ) -> Result<(), Error> {
        let message_json = serde_json::to_vec(message)?;

        self.channel
            .basic_publish(
                BROADCAST_EXCHANGE_NAME,
                "broadcast",
                BasicPublishOptions::default(),
                &message_json,
                lapin::BasicProperties::default(),
            )
            .await?;

        info!("Message published to RabbitMQ: telegram_id={}, broadcast_id={}", 
              message.telegram_id, message.broadcast_id);
        Ok(())
    }

    /// Создает consumer для событий
    pub async fn create_events_consumer(
        &self,
        consumer_tag: &str,
    ) -> Result<Consumer, Error> {
        let consumer = self.channel
            .basic_consume(
                EVENTS_QUEUE_NAME,
                consumer_tag,
                BasicConsumeOptions::default(),
                FieldTable::default(),
            )
            .await?;

        info!("Events consumer created with tag: {}", consumer_tag);
        Ok(consumer)
    }

    /// Создает consumer для сообщений
    pub async fn create_messages_consumer(
        &self,
        consumer_tag: &str,
    ) -> Result<Consumer, Error> {
        // Настраиваем QoS
        self.channel
            .basic_qos(1, BasicQosOptions::default())
            .await?;

        let consumer = self.channel
            .basic_consume(
                BROADCAST_QUEUE_NAME,
                consumer_tag,
                BasicConsumeOptions::default(),
                FieldTable::default(),
            )
            .await?;

        info!("Messages consumer created with tag: {}", consumer_tag);
        Ok(consumer)
    }

    /// Подтверждает обработку сообщения
    pub async fn ack_message(&self, delivery_tag: u64) -> Result<(), Error> {
        self.channel
            .basic_ack(delivery_tag, BasicAckOptions::default())
            .await?;
        Ok(())
    }

    /// Получает канал для прямого доступа (если нужен)
    pub fn get_channel(&self) -> &Channel {
        &self.channel
    }
}

/// Воркер для обработки событий
pub struct EventsWorker {
    client: RabbitMQClient,
}

impl EventsWorker {
    pub async fn new() -> Result<Self, Error> {
        let client = RabbitMQClient::new().await?;
        Ok(EventsWorker { client })
    }

    pub async fn start_processing<F, Fut>(&self, consumer_tag: &str, handler: F) -> Result<(), Error>
    where
        F: Fn(BroadcastEvent) -> Fut + Send + Sync + 'static,
        Fut: std::future::Future<Output = Result<(), Error>> + Send + 'static,
    {
        let consumer = self.client.create_events_consumer(consumer_tag).await?;
        
        info!("🚀 Events worker started with tag: {}", consumer_tag);
        info!("Waiting for broadcast events...");

        self.process_events(consumer, handler).await?;
        Ok(())
    }

    async fn process_events<F, Fut>(
        &self,
        mut consumer: Consumer,
        handler: F,
    ) -> Result<(), Error>
    where
        F: Fn(BroadcastEvent) -> Fut + Send + Sync + 'static,
        Fut: std::future::Future<Output = Result<(), Error>> + Send + 'static,
    {
        info!("🎯 Starting events processing loop");

        while let Some(delivery) = consumer.next().await {
            let delivery = match delivery {
                Ok(delivery) => {
                    info!("✅ Event received, tag: {}", delivery.delivery_tag);
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
                    if let Err(e) = self.client.ack_message(delivery_tag).await {
                        error!("Failed to ack event: {}", e);
                    }
                    continue;
                }
            };

            // Обрабатываем событие
            match handler(event).await {
                Ok(_) => {
                    info!("✅ Event processed successfully");
                }
                Err(e) => {
                    error!("❌ Failed to process event: {}", e);
                }
            }

            // Подтверждаем обработку
            if let Err(e) = self.client.ack_message(delivery_tag).await {
                error!("❌ Failed to ack event: {}", e);
            } else {
                info!("✅ Event acknowledged successfully");
            }

            // Небольшая задержка
            tokio::time::sleep(Duration::from_millis(100)).await;
        }

        info!("🛑 Events processing loop ended");
        Ok(())
    }
}

/// Воркер для обработки сообщений
pub struct MessagesWorker {
    client: RabbitMQClient,
}

impl MessagesWorker {
    pub async fn new() -> Result<Self, Error> {
        let client = RabbitMQClient::new().await?;
        Ok(MessagesWorker { client })
    }

    pub async fn start_processing<F, Fut>(&self, consumer_tag: &str, handler: F) -> Result<(), Error>
    where
        F: Fn(BroadcastMessage) -> Fut + Send + Sync + 'static,
        Fut: std::future::Future<Output = Result<(), Error>> + Send + 'static,
    {
        let consumer = self.client.create_messages_consumer(consumer_tag).await?;
        
        info!("🚀 Messages worker started with tag: {}", consumer_tag);
        info!("Waiting for broadcast messages...");

        self.process_messages(consumer, handler).await?;
        Ok(())
    }

    async fn process_messages<F, Fut>(
        &self,
        mut consumer: Consumer,
        handler: F,
    ) -> Result<(), Error>
    where
        F: Fn(BroadcastMessage) -> Fut + Send + Sync + 'static,
        Fut: std::future::Future<Output = Result<(), Error>> + Send + 'static,
    {
        info!("🎯 Starting messages processing loop");

        while let Some(delivery) = consumer.next().await {
            let delivery = match delivery {
                Ok(delivery) => {
                    info!("✅ Message received, tag: {}", delivery.delivery_tag);
                    delivery
                }
                Err(e) => {
                    error!("❌ Failed to receive message: {}", e);
                    continue;
                }
            };

            let delivery_tag = delivery.delivery_tag;

            // Парсим сообщение
            let message: BroadcastMessage = match serde_json::from_slice(&delivery.data) {
                Ok(message) => message,
                Err(e) => {
                    error!("Failed to parse message: {}", e);
                    if let Err(e) = self.client.ack_message(delivery_tag).await {
                        error!("Failed to ack message: {}", e);
                    }
                    continue;
                }
            };

            info!("=== PROCESSING BROADCAST MESSAGE ===");
            info!("Telegram ID: {}", message.telegram_id);
            info!("Broadcast ID: {}", message.broadcast_id);

            // Обрабатываем сообщение
            match handler(message).await {
                Ok(_) => {
                    info!("✅ Message processed successfully");
                }
                Err(e) => {
                    error!("❌ Failed to process message: {}", e);
                }
            }

            // Подтверждаем обработку
            if let Err(e) = self.client.ack_message(delivery_tag).await {
                error!("❌ Failed to ack message: {}", e);
            } else {
                info!("✅ Message acknowledged successfully");
            }

            // Небольшая задержка
            tokio::time::sleep(Duration::from_millis(100)).await;
        }

        info!("🛑 Messages processing loop ended");
        Ok(())
    }
}
