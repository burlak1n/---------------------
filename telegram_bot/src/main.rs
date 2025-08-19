use serde::{Deserialize, Serialize};
use std::fs;
use std::sync::Arc;
use teloxide::types::{InlineKeyboardButton, InlineKeyboardButtonKind, InlineKeyboardMarkup};
use teloxide::{prelude::*, utils::command::BotCommands};
use lapin::{Connection, ConnectionProperties, Result as LapinResult, options::*, types::FieldTable, BasicProperties, Channel};
use chrono::Utc;

#[derive(Debug, Serialize, Deserialize, Clone)]
struct Slot {
    time: String,
    location: String,
    max_users: u32,
    booked_users: Vec<u64>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct SlotDate {
    date: String,
    slots: Vec<Slot>,
}

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

fn load_available_slots() -> Result<Vec<SlotDate>, Box<dyn std::error::Error>> {
    let data = fs::read_to_string("available_slots.json")?;
    let slots: Vec<SlotDate> = serde_json::from_str(&data)?;
    Ok(slots)
}

fn load_allowed_users() -> Result<Vec<u64>, Box<dyn std::error::Error>> {
    let data = fs::read_to_string("allowed_users.json")?;
    let users: Vec<u64> = serde_json::from_str(&data)?;
    Ok(users)
}

#[derive(BotCommands, Clone)]
#[command(rename_rule = "lowercase", description = "These commands are supported:")]
enum Command {
    #[command(description = "Display this text.")]
    Help,
    #[command(description = "Start the interview booking process.")]
    StartInterview,
}

async fn command_handler(bot: Bot, msg: Message, cmd: Command) -> ResponseResult<()> {
    match cmd {
        Command::Help => {
            bot.send_message(msg.chat.id, Command::descriptions().to_string()).await?;
        }
        Command::StartInterview => {
            let keyboard = InlineKeyboardMarkup::new(vec![vec![
                InlineKeyboardButton::new("Sign Up", InlineKeyboardButtonKind::CallbackData("sign_up".to_string())),
            ]]);
            bot.send_message(msg.chat.id, "Sign up for interviews!").reply_markup(keyboard).await?;
        }
    };
    Ok(())
}

async fn callback_handler(
    q: CallbackQuery,
    bot: Bot,
    slots: Arc<Vec<SlotDate>>,
    allowed_users: Arc<Vec<u64>>,
    channel: Arc<Channel>,
) -> ResponseResult<()> {
    if !allowed_users.contains(&q.from.id.0) {
        bot.answer_callback_query(q.id.clone())
            .text("You are not authorized to use this bot.")
            .show_alert(true)
            .await?;
        return Ok(())
    }

    if let Some(ref data) = q.data {
        if data == "sign_up" {
            handle_sign_up(&q, bot, slots).await?;
        } else if data.starts_with("book_") {
            handle_slot_selection(&q, bot, data).await?;
        } else if data.starts_with("confirm_") {
            handle_confirm_booking(&q, bot, data, channel, slots).await?;
        }
    }

    Ok(())
}

async fn handle_sign_up(q: &CallbackQuery, bot: Bot, slots: Arc<Vec<SlotDate>>) -> ResponseResult<()> {
    bot.answer_callback_query(q.id.clone()).await?;

    if let Some(msg) = &q.message {
        let mut keyboard_buttons = vec![];
        let mut count = 0;

        for date_slots in slots.iter() {
            for slot in &date_slots.slots {
                if count < 3 {
                    let text = format!("{} at {} ({})", date_slots.date, slot.time, slot.location);
                    let callback_data = format!("book_{}_{}", date_slots.date, slot.time);
                    keyboard_buttons.push(vec![InlineKeyboardButton::new(
                        text,
                        InlineKeyboardButtonKind::CallbackData(callback_data),
                    )]);
                    count += 1;
                } else {
                    break;
                }
            }
            if count >= 3 {
                break;
            }
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
    if parts.len() == 3 {
        let date = parts[1];
        let time = parts[2];

        if let Some(msg) = &q.message {
            let text = format!("You have selected the slot on {} at {}. Please confirm.", date, time);
            let confirm_callback_data = format!("confirm_{}_{}", date, time);
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

async fn handle_confirm_booking(q: &CallbackQuery, bot: Bot, data: &str, channel: Arc<Channel>, slots: Arc<Vec<SlotDate>>) -> ResponseResult<()> {
    bot.answer_callback_query(q.id.clone()).await?;

    let parts: Vec<&str> = data.split('_').collect();
    if parts.len() == 3 {
        let date = parts[1];
        let time = parts[2];

        // Find the location for the event payload
        let location = slots.iter()
            .find(|d| d.date == date)
            .and_then(|d| d.slots.iter().find(|s| s.time == time))
            .map(|s| s.location.as_str())
            .unwrap_or(""); // Default to empty string if not found

        if let Some(msg) = &q.message {
            let text = format!("Success! Your booking is confirmed for {} at {}.\nUse /reschedule to change your slot.", date, time);
            
            let event = BookingEvent {
                event_type: "booking.created",
                user_telegram_id: q.from.id.0,
                timestamp: Utc::now().to_rfc3339(),
                payload: BookingPayload {
                    old_date: None,
                    old_time: None,
                    new_date: date,
                    new_time: time,
                    location,
                },
            };
            let payload = match serde_json::to_string(&event) {
                Ok(p) => p.as_bytes().to_vec(),
                Err(e) => {
                    tracing::error!("Failed to serialize booking event: {}", e);
                    return Ok(()); // Or handle error appropriately
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

    Ok(())
}


#[tokio::main]
async fn main() -> LapinResult<()> {
    dotenvy::dotenv().expect(".env file not found");
    tracing_subscriber::fmt::init();
    tracing::info!("Starting interview booking bot...");

    let allowed_users = Arc::new(load_allowed_users().expect("Could not load allowed users"));
    let available_slots = Arc::new(load_available_slots().expect("Could not load available slots"));

    tracing::info!("Loaded {} allowed users", allowed_users.len());
    tracing::info!("Loaded {} dates with slots", available_slots.len());

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
    tracing::info!("Declared queue '{}'", queue_name);


    let bot = Bot::from_env();

    let handler = dptree::entry()
        .branch(Update::filter_message().filter_command::<Command>().endpoint(command_handler))
        .branch(Update::filter_callback_query().endpoint(callback_handler));

    Dispatcher::builder(bot, handler)
        .dependencies(dptree::deps![allowed_users, available_slots, Arc::new(channel)])
        .enable_ctrlc_handler()
        .build()
        .dispatch()
        .await;

    tracing::info!("Bot has stopped.");
    Ok(())
}
