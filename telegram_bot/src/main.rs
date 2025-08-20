use std::env;
use std::sync::Arc;
use teloxide::prelude::*;
use teloxide::types::{InlineKeyboardButton, InlineKeyboardButtonKind, InlineKeyboardMarkup, ParseMode};
use teloxide::utils::command::BotCommands;
use chrono::{Utc, Datelike, TimeZone};
use sqlx::SqlitePool;
use core_logic::CreateUserRequest;
use anyhow::Context;

mod broadcast;

#[derive(BotCommands, Clone)]
#[command(rename_rule = "lowercase", description = "These commands are supported:")]
enum Command {
    #[command(description = "Display this text.")]
    Help,
    #[command(description = "Get contact information.")]
    Contact,
    #[command(description = "Reschedule your interview.")]
    Reschedule,
}

#[derive(Clone)]
enum UserMessage {
    Welcome,
    ContactInfo(String),
    ChooseSlot,
    NoSlotsAvailable(String),
    SlotSelected { time: String, place: String },
    SlotNotFound,
    SlotError,
    BookingConfirmed { time: String, place: String, name: String },
    SlotFull { max_users: u16, current_count: u16 },
    SlotNotFoundError,
    UserNotFound,
    DatabaseError(String),
    Reminder { time: String, place: String },
}

impl UserMessage {
    fn to_string(&self) -> String {
        match self {
            UserMessage::Welcome => "Поздравляем! Ты успешно прошёл анкетирование и можешь записаться на собеседование по кнопке ниже".to_string(),
            UserMessage::ContactInfo(username) => format!("For questions, please contact: https://t.me/{}", username),
            UserMessage::ChooseSlot => "Please choose a slot:".to_string(),
            UserMessage::NoSlotsAvailable(username) => format!("К сожалению, на данный момент нет доступных слотов. Свяжитесь с <a href='https://t.me/{}'>администратором</a>.", username),
            UserMessage::SlotSelected { time, place } => format!("📋 Выбранный слот:\n\n📅 Время: {}\n🏢 Место: {}\n\nНажмите 'Подтвердить' для завершения записи.", time, place),
            UserMessage::SlotNotFound => "❌ Слот не найден. Попробуйте выбрать другой слот.".to_string(),
            UserMessage::SlotError => "❌ Ошибка при получении информации о слоте. Попробуйте позже.".to_string(),
            UserMessage::BookingConfirmed { time, place, name: _ } => format!("🎉 Бронирование подтверждено!\n\n📅 Время: {}\n🏢 Место: {}\n\nОбратитесь к администратору для изменения времени.", time, place),
            UserMessage::SlotFull { max_users, current_count } => format!("❌ Слот переполнен!\n\nМаксимальное количество пользователей: {}\nТекущее количество: {}\n\nПопробуйте выбрать другой слот или обратитесь к администратору.", max_users, current_count),
            UserMessage::SlotNotFoundError => "❌ Слот не найден. Возможно, он был удален. Попробуйте выбрать другой слот.".to_string(),
            UserMessage::UserNotFound => "❌ Пользователь не найден. Обратитесь к администратору.".to_string(),
            UserMessage::DatabaseError(error) => format!("❌ Ошибка базы данных: {}\n\nПопробуйте позже или обратитесь к администратору.", error),
            UserMessage::Reminder { time, place } => format!("🔔 Напоминание о собеседовании!\n\n📅 Сегодня в {}\n🏢 Место: {}\n\nУдачи на собеседовании! 🍀", time, place),
        }
    }
}

async fn command_handler(bot: Bot, msg: Message, cmd: Command) -> ResponseResult<()> {
    match cmd {
        Command::Help => {
            bot.send_message(msg.chat.id, Command::descriptions().to_string()).await?;
        }
        Command::Reschedule => {
            let keyboard = InlineKeyboardMarkup::new(vec![vec![
                InlineKeyboardButton::new("Записаться", InlineKeyboardButtonKind::CallbackData("sign_up".to_string())),
            ]]);
            bot.send_message(msg.chat.id, UserMessage::Welcome.to_string())
                .parse_mode(ParseMode::Html)
                .reply_markup(keyboard)
                .await?;
        }
        Command::Contact => {
            let username = env::var("CONTACT_USERNAME").unwrap_or_default();
            let message = UserMessage::ContactInfo(username);
            bot.send_message(msg.chat.id, message.to_string()).await?;
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
            handle_slot_selection(&q, bot, data, pool).await?;
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
                    let text = format!("📅 {} | 🏢 {}", 
                        slot.time.format("%Y-%m-%d %H:%M"), 
                        slot.place
                    );
                    let callback_data = format!("book_{}", slot.id);
                    keyboard_buttons.push(vec![InlineKeyboardButton::new(
                        text,
                        InlineKeyboardButtonKind::CallbackData(callback_data),
                    )]);
                }

                if !keyboard_buttons.is_empty() {
                    let keyboard = InlineKeyboardMarkup::new(keyboard_buttons);
                    bot.edit_message_text(msg.chat().id, msg.id(), UserMessage::ChooseSlot.to_string())
                        .parse_mode(ParseMode::Html)
                        .reply_markup(keyboard)
                        .await?;
                } else {
                    let username = env::var("CONTACT_USERNAME").unwrap_or_default();
                    let message = UserMessage::NoSlotsAvailable(username);
                    bot.edit_message_text(msg.chat().id, msg.id(), message.to_string())
                        .parse_mode(ParseMode::Html)
                        .await?;
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

async fn handle_slot_selection(q: &CallbackQuery, bot: Bot, data: &str, pool: Arc<SqlitePool>) -> ResponseResult<()> {
    bot.answer_callback_query(q.id.clone()).await?;

    let parts: Vec<&str> = data.split('_').collect();
    if parts.len() == 2 {
        if let Ok(slot_id) = parts[1].parse::<i64>() {
            if let Some(msg) = &q.message {
                // Получаем информацию о слоте из БД
                match core_logic::db::get_slot(&pool, slot_id).await {
                    Ok(Some(slot)) => {
                        let time = slot.time.format("%Y-%m-%d %H:%M").to_string();
                        let place = slot.place.clone();
                        let message = UserMessage::SlotSelected { time, place };
                        let confirm_callback_data = format!("confirm_{}", slot_id);
                        let keyboard = InlineKeyboardMarkup::new(vec![vec![InlineKeyboardButton::new(
                            "Подтвердить",
                            InlineKeyboardButtonKind::CallbackData(confirm_callback_data),
                        )]]);

                        bot.edit_message_text(msg.chat().id, msg.id(), message.to_string())
                            .parse_mode(ParseMode::Html)
                            .reply_markup(keyboard)
                            .await?;
                    }
                    Ok(None) => {
                        let message = UserMessage::SlotNotFound;
                        bot.edit_message_text(msg.chat().id, msg.id(), message.to_string())
                            .parse_mode(ParseMode::Html)
                            .await?;
                    }
                    Err(e) => {
                        tracing::error!("Failed to get slot: {}", e);
                        let message = UserMessage::SlotError;
                        bot.edit_message_text(msg.chat().id, msg.id(), message.to_string())
                            .parse_mode(ParseMode::Html)
                            .await?;
                    }
                }
            }
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

                    match core_logic::db::create_or_update_booking(&pool, user.id, Some(slot_id)).await {
                        Ok(_) => {
                            let time = slot.time.format("%Y-%m-%d %H:%M").to_string();
                            let place = slot.place.clone();
                            let message = UserMessage::BookingConfirmed { time, place, name: String::new() };
                            bot.edit_message_text(msg.chat().id, msg.id(), message.to_string())
                                .parse_mode(ParseMode::Html)
                                .reply_markup(InlineKeyboardMarkup::new(vec![vec![]]))
                                .await?;
                        }
                        Err(e) => {
                            let error_message = match e {
                                core_logic::BookingError::SlotFull { max_users, current_count } => {
                                    UserMessage::SlotFull { max_users, current_count }.to_string()
                                }
                                core_logic::BookingError::SlotNotFound => {
                                    UserMessage::SlotNotFoundError.to_string()
                                }
                                core_logic::BookingError::UserNotFound => {
                                    UserMessage::UserNotFound.to_string()
                                }
                                core_logic::BookingError::Database(db_error) => {
                                    UserMessage::DatabaseError(db_error.to_string()).to_string()
                                }
                            };
                            
                            bot.edit_message_text(msg.chat().id, msg.id(), error_message)
                                .parse_mode(ParseMode::Html)
                                .reply_markup(InlineKeyboardMarkup::new(vec![vec![
                                    InlineKeyboardButton::new("Попробовать снова", InlineKeyboardButtonKind::CallbackData("sign_up".to_string()))
                                ]]))
                                .await?;
                        }
                    }
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
            let time = booking.time.format("%H:%M").to_string();
            let place = booking.place.clone();
            let message = UserMessage::Reminder { time, place };
            if let Err(e) = bot.send_message(ChatId(booking.telegram_id), message.to_string())
                .parse_mode(ParseMode::Html)
                .await {
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
        _ = notification_scheduler(bot.clone(), pool.clone()) => {},
        _ = broadcast::broadcast_worker(bot, pool) => {},
    }

    Ok(())
}
