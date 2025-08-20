use serde::Serialize;
use std::env;
use std::sync::Arc;
use teloxide::prelude::*;
use teloxide::types::{InlineKeyboardButton, InlineKeyboardButtonKind, InlineKeyboardMarkup};
use teloxide::utils::command::BotCommands;
use chrono::{Utc, Timelike, Datelike, TimeZone};
use sqlx::SqlitePool;
use core_logic::CreateUserRequest;
use anyhow::Context;

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
) -> ResponseResult<()> {
    

    if let Some(ref data) = q.data {
        if data == "sign_up" {
            handle_sign_up(&q, bot, pool).await?;
        } else if data.starts_with("book_") {
            handle_slot_selection(&q, bot, data).await?;
        } else if data.starts_with("confirm_") {
            handle_confirm_booking(&q, bot, data, pool).await?;
        }
    }

    Ok(())
}

async fn handle_sign_up(q: &CallbackQuery, bot: Bot, pool: Arc<SqlitePool>) -> ResponseResult<()> {
    bot.answer_callback_query(q.id.clone()).await?;

    if let Some(msg) = &q.message {
        match core_logic::db::get_available_slots(&pool).await {
            Ok(slots) => {
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
            Err(e) => {
                tracing::error!("Failed to get available slots: {}", e);
                bot.edit_message_text(msg.chat().id, msg.id(), "Sorry, something went wrong.").await?;
            }
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

async fn handle_confirm_booking(q: &CallbackQuery, bot: Bot, data: &str, pool: Arc<SqlitePool>) -> ResponseResult<()> {
    bot.answer_callback_query(q.id.clone()).await?;

    let parts: Vec<&str> = data.split('_').collect();
    if parts.len() == 2 {
        if let Ok(slot_id) = parts[1].parse::<i64>() {
            if let Ok(Some(slot)) = core_logic::db::get_slot(&pool, slot_id).await {
                if let Some(msg) = &q.message {
                    let user = match core_logic::db::get_user_by_telegram_id(&pool, q.from.id.0 as i64).await {
                        Ok(Some(user)) => user,
                        Ok(None) => {
                            let new_user = CreateUserRequest {
                                name: q.from.first_name.clone(),
                                telegram_id: Some(q.from.id.0 as i64),
                            };
                            match core_logic::db::create_user(&pool, new_user).await {
                                Ok(user) => user,
                                Err(e) => {
                                    tracing::error!("Failed to create user: {}", e);
                                    return Ok(())
                                }
                            }
                        }
                        Err(e) => {
                            tracing::error!("Failed to get user by telegram id: {}", e);
                            return Ok(())
                        }
                    };

                    let text = format!("Success! Your booking is confirmed for {} at {}.\nUse /reschedule to change your slot.", "Date", slot.time);
                    if let Err(e) = core_logic::db::create_or_update_booking(&pool, user.id, Some(slot_id)).await {
                        tracing::error!("Failed to create or update booking: {}", e);
                        return Ok(())
                    }

                    bot.edit_message_text(msg.chat().id, msg.id(), text)
                        .reply_markup(InlineKeyboardMarkup::new(vec![vec![]]))
                        .await?;
                }
            }
        }
    }

    Ok(())
}

async fn notification_scheduler(bot: Bot, pool: Arc<SqlitePool>) {
    loop {
        let now = Utc::now();
        let nine_am_utc = Utc.with_ymd_and_hms(now.year(), now.month(), now.day(), 9, 0, 0).unwrap();
        let sleep_duration = if now < nine_am_utc {
            (nine_am_utc - now).to_std()
        } else {
            (nine_am_utc + chrono::Duration::days(1) - now).to_std()
        };

        if let Ok(duration) = sleep_duration {
            tokio::time::sleep(duration).await;
        }

        let bookings = match core_logic::db::get_todays_bookings(&pool).await {
            Ok(bookings) => bookings,
            Err(e) => {
                tracing::error!("Failed to get today's bookings: {}", e);
                continue;
            }
        };

        for booking in bookings {
            let message = format!("Reminder: You have an interview today at {} at {}.", booking.time, booking.place);
            if let Err(e) = bot.send_message(ChatId(booking.telegram_id), message).await {
                tracing::error!("Failed to send reminder to user {}: {}", booking.telegram_id, e);
            }
        }
    }
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenvy::dotenv().context(".env file not found")?;
    tracing_subscriber::fmt::init();
    tracing::info!("Starting interview booking bot...");

    let pool = Arc::new(core_logic::db::init_db().await.context("Failed to initialize database")?);

    let bot = Bot::from_env();

    let handler = dptree::entry()
        .branch(Update::filter_message().filter_command::<Command>().endpoint(command_handler))
        .branch(Update::filter_callback_query().endpoint(callback_handler));

    let mut dispatcher = Dispatcher::builder(bot.clone(), handler)
        .dependencies(dptree::deps![pool.clone()])
        .enable_ctrlc_handler()
        .build();

    tokio::select! {
        _ = dispatcher.dispatch() => {},
        _ = notification_scheduler(bot, pool) => {},
    }

    Ok(())
}
