use serde::Serialize;
use std::env;
use std::sync::Arc;
use teloxide::types::{InlineKeyboardButton, InlineKeyboardButtonKind, InlineKeyboardMarkup};
use teloxide::{prelude::*, utils::command::BotCommands};
use lapin::{Connection, ConnectionProperties, Result as LapinResult, options::*, types::FieldTable, BasicProperties, Channel};
use chrono::Utc;
use sqlx::SqlitePool;

mod db;

#[derive(Debug, Serialize)]
struct BookingEvent<'a> {
    event_type: &'a str,
    user_telegram_id: u64,
    timestamp: String,
    payload: BookingPayload<'a>,
}

#[derive(Debug, Serialize)]
struct BookingPayload<'a> {
    old_date: Option<&'a str>,
    old_time: Option<&'a str>,
    new_date: &'a str,
    new_time: &'a str,
    location: &'a str,
}

#[derive(BotCommands, Clone)]
#[command(rename_rule = "lowercase", description = "These commands are supported:")]
enum Command {
    #[command(description = "Display this text.")]
    Help,
    #[command(description = "Start or restart the booking process.")]
    Start,
    #[command(description = "Get contact information.")]
    Contact,
    #[command(description = "Reschedule your interview.")]
    Reschedule,
}

async fn command_handler(bot: Bot, msg: Message, cmd: Command) -> ResponseResult<()> {
    match cmd {
        Command::Help => {
            bot.send_message(msg.chat.id, Command::descriptions().to_string()).await?;
        }
        Command::Start | Command::Reschedule => {
            let keyboard = InlineKeyboardMarkup::new(vec![vec![
                InlineKeyboardButton::new("Sign Up", InlineKeyboardButtonKind::CallbackData("sign_up".to_string())),
            ]]);
            bot.send_message(msg.chat.id, "Please choose a new slot.").reply_markup(keyboard).await?;
        }
        Command::Contact => {
            let text = match env::var("CONTACT_USERNAME") {
                Ok(username) => format!("For questions, please contact: https://t.me/{}", username),
                Err(_) => "Contact information is not configured.".to_string(),
            };
            bot.send_message(msg.chat.id, text).await?;
        }
    };
    Ok(())
}

async fn callback_handler(
    q: CallbackQuery,
    bot: Bot,
    pool: Arc<SqlitePool>,
    channel: Arc<Channel>,
) -> ResponseResult<()> {
    let allowed_users = db::get_allowed_users(&pool).await.unwrap_or_default();
    if !allowed_users.iter().any(|u| u.user_id == q.from.id.0 as i64) {
        bot.answer_callback_query(q.id.clone())
            .text("You are not authorized to use this bot.")
            .show_alert(true)
            .await?;
        return Ok(())
    }

    if let Some(ref data) = q.data {
        if data == "sign_up" {
            handle_sign_up(&q, bot, pool).await?;
        } else if data.starts_with("book_") {
            handle_slot_selection(&q, bot, data).await?;
        } else if data.starts_with("confirm_") {
            handle_confirm_booking(&q, bot, data, channel, pool).await?;
        }
    }

    Ok(())
}

async fn handle_sign_up(q: &CallbackQuery, bot: Bot, pool: Arc<SqlitePool>) -> ResponseResult<()> {
    bot.answer_callback_query(q.id.clone()).await?;

    if let Some(msg) = &q.message {
        let slots = db::get_available_slots(&pool).await.unwrap_or_default();
        let mut keyboard_buttons = vec![];

        for slot in slots.iter().take(3) {
            let text = format!("{} at {} ({})", "Date", slot.time, slot.place);
            let callback_data = format!("book_{}", slot.id);
            keyboard_buttons.push(vec![InlineKeyboardButton::new(
                text,
                InlineKeyboardButtonKind::CallbackData(callback_data),
            )]);
        }

        if !keyboard_buttons.is_empty() {
            let keyboard = InlineKeyboardMarkup::new(keyboard_buttons);
            bot.edit_message_text(msg.chat().id, msg.id(), "Please choose a slot:")
                .reply_markup(keyboard)
                .await?;
        } else {
            bot.edit_message_text(msg.chat().id, msg.id(), "Sorry, no available slots at the moment.").await?;
        }
    }
    Ok(())
}

async fn handle_slot_selection(q: &CallbackQuery, bot: Bot, data: &str) -> ResponseResult<()> {
    bot.answer_callback_query(q.id.clone()).await?;

    let parts: Vec<&str> = data.split('_').collect();
    if parts.len() == 2 {
        let slot_id = parts[1];

        if let Some(msg) = &q.message {
            let text = format!("You have selected slot {}. Please confirm.", slot_id);
            let confirm_callback_data = format!("confirm_{}", slot_id);
            let keyboard = InlineKeyboardMarkup::new(vec![vec![InlineKeyboardButton::new(
                "Confirm",
                InlineKeyboardButtonKind::CallbackData(confirm_callback_data),
            )]]);

            bot.edit_message_text(msg.chat().id, msg.id(), text)
                .reply_markup(keyboard)
                .await?;
        }
    }

    Ok(())
}

async fn handle_confirm_booking(q: &CallbackQuery, bot: Bot, data: &str, channel: Arc<Channel>, pool: Arc<SqlitePool>) -> ResponseResult<()> {
    bot.answer_callback_query(q.id.clone()).await?;

    let parts: Vec<&str> = data.split('_').collect();
    if parts.len() == 2 {
        let slot_id = parts[1].parse::<i64>().unwrap_or_default();

        if let Some(slot) = db::get_slot(&pool, slot_id).await.unwrap_or_default() {
            if let Some(msg) = &q.message {
                let text = format!("Success! Your booking is confirmed for {} at {}.\nUse /reschedule to change your slot.", "Date", slot.time);
                db::create_or_update_booking(&pool, q.from.id.0 as i64, Some(slot_id)).await.unwrap();

                let event = BookingEvent {
                    event_type: "booking.created",
                    user_telegram_id: q.from.id.0,
                    timestamp: Utc::now().to_rfc3339(),
                    payload: BookingPayload {
                        old_date: None,
                        old_time: None,
                        new_date: "Date",
                        new_time: &slot.time,
                        location: &slot.place,
                    },
                };
                let payload = match serde_json::to_string(&event) {
                    Ok(p) => p.as_bytes().to_vec(),
                    Err(e) => {
                        tracing::error!("Failed to serialize booking event: {}", e);
                        return Ok(())
                    }
                };

                match channel.basic_publish(
                    "",
                    "admin.booking.event",
                    BasicPublishOptions::default(),
                    &payload,
                    BasicProperties::default()
                ).await {
                    Ok(_) => tracing::info!("Published booking event for user {}", q.from.id),
                    Err(e) => tracing::error!("Failed to publish booking event: {}", e),
                };

                bot.edit_message_text(msg.chat().id, msg.id(), text)
                    .reply_markup(InlineKeyboardMarkup::new(vec![vec![]]))
                    .await?;
            }
        }
    }

    Ok(())
}

async fn notification_scheduler(_bot: Bot) {
    let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(60));
    loop {
        interval.tick().await;
        // TODO: Implement notification logic
        // 1. Get the current time in MSK timezone (requires a crate like chrono-tz).
        // 2. Check if the time is 11:00 AM.
        // 3. Access persistent storage of bookings (e.g., Redis or a database).
        // 4. Iterate through today's bookings and send reminders.
    }
}

#[tokio::main]
async fn main() -> LapinResult<()> {
    dotenvy::dotenv().expect(".env file not found");
    tracing_subscriber::fmt::init();
    tracing::info!("Starting interview booking bot...");

    let pool = db::init_db().await.expect("Failed to initialize database");

    let addr = "amqp://guest:guest@localhost:5672/%2f";
    let conn = Connection::connect(addr, ConnectionProperties::default()).await?;
    tracing::info!("Connected to RabbitMQ");
    let channel = conn.create_channel().await?;
    
    let queue_name = "admin.booking.event";
    channel.queue_declare(
        queue_name,
        QueueDeclareOptions::default(),
        FieldTable::default(),
    ).await?;
    tracing::info!("Declared queue 'admin.booking.event'");


    let bot = Bot::from_env();

    let handler = dptree::entry()
        .branch(Update::filter_message().filter_command::<Command>().endpoint(command_handler))
        .branch(Update::filter_callback_query().endpoint(callback_handler));

    let mut dispatcher = Dispatcher::builder(bot.clone(), handler)
        .dependencies(dptree::deps![Arc::new(pool), Arc::new(channel)])
        .enable_ctrlc_handler()
        .build();

    tokio::select! {
        _ = dispatcher.dispatch() => {},
        _ = notification_scheduler(bot) => {},
    }

    Ok(())
}
