use std::env;
use std::sync::Arc;
use teloxide::prelude::*;
use teloxide::types::{InlineKeyboardButton, InlineKeyboardButtonKind, InlineKeyboardMarkup, ParseMode};
use teloxide::utils::command::BotCommands;
use chrono::{Utc, Datelike, TimeZone, Timelike};
use sqlx::SqlitePool;
use core_logic::CreateUserRequest;
use anyhow::Context;

mod broadcast;

// Константы для текстов
const WELCOME_MESSAGE: &str = "🎉 Отлично! Ты успешно прошёл анкетирование и можешь записаться на собеседование. Выбери удобное время ниже 👇";
const NO_SLOTS_MESSAGE_TEMPLATE: &str = "😔 К сожалению, на данный момент нет доступных слотов для записи.\n\nЕсли у вас есть вопросы, свяжитесь с <a href='https://t.me/{USERNAME}'>администратором</a>.";
const SLOT_SELECTED_TEMPLATE: &str = "✅ Выбранный слот:\n\n📅 Время: {TIME}\n🏢 Место: {PLACE}\n\nНажмите 'Подтвердить' для завершения записи.";
const SLOT_NOT_FOUND_MESSAGE: &str = "⚠️ Выбранный слот больше не доступен. Пожалуйста, выберите другой слот.";
const SLOT_ERROR_MESSAGE: &str = "⚠️ Произошла ошибка при получении информации о слоте. Пожалуйста, попробуйте позже.";
const BOOKING_CONFIRMED_TEMPLATE: &str = "🎉 Бронирование подтверждено!\n\n📅 Время: {TIME}\n🏢 Место: {PLACE}\n\n✅ Ваша запись успешно создана!\n\n💡 Для изменения времени свяжитесь с <a href='https://t.me/{USERNAME}'>администратором</a>.";
const SLOT_FULL_TEMPLATE: &str = "❌ Слот переполнен!\n\nМаксимальное количество пользователей: {MAX_USERS}\nТекущее количество: {CURRENT_COUNT}\n\nПопробуйте выбрать другой слот или обратитесь к <a href='https://t.me/{USERNAME}'>администратору</a>.";
const SLOT_NOT_FOUND_ERROR_MESSAGE: &str = "❌ Слот не найден. Возможно, он был удален. Попробуйте выбрать другой слот.";
const USER_NOT_FOUND_MESSAGE: &str = "❌ Пользователь не найден. Обратитесь к <a href='https://t.me/{USERNAME}'>администратору</a>.";
const DATABASE_ERROR_TEMPLATE: &str = "❌ Ошибка базы данных: {ERROR}\n\nПопробуйте позже или обратитесь к <a href='https://t.me/{USERNAME}'>администратору</a>.";
const REMINDER_TEMPLATE: &str = "🔔 Напоминание о собеседовании!\n\n📅 Сегодня в {TIME}\n🏢 Место: {PLACE}\n\nУдачи на собеседовании! 🍀";
const CONTACT_INFO_TEMPLATE: &str = "For questions, please contact: https://t.me/{USERNAME}";

// Плейсхолдеры для замены
const USERNAME_PLACEHOLDER: &str = "{USERNAME}";
const TIME_PLACEHOLDER: &str = "{TIME}";
const PLACE_PLACEHOLDER: &str = "{PLACE}";
const MAX_USERS_PLACEHOLDER: &str = "{MAX_USERS}";
const CURRENT_COUNT_PLACEHOLDER: &str = "{CURRENT_COUNT}";
const ERROR_PLACEHOLDER: &str = "{ERROR}";

// Кнопки
const SHOW_MORE_SLOTS_BUTTON: &str = "🔄 Показать другие варианты";
const BACK_TO_FIRST_PAGE_BUTTON: &str = "⬅️ Вернуться к основным слотам";
const TRY_AGAIN_BUTTON: &str = "🔄 Попробовать снова";
const CONFIRM_BUTTON: &str = "Подтвердить";
const SIGN_UP_BUTTON: &str = "Записаться";

// Заголовки
const MORE_SLOTS_HEADER: &str = "✨ Больше вариантов для записи:";
const ALL_SLOTS_HEADER: &str = "📋 Все доступные слоты на данный момент:";

// Сообщения об ошибках
const GENERIC_ERROR_MESSAGE: &str = "Sorry, something went wrong.";

// Callback'и
const SIGN_UP_CALLBACK: &str = "sign_up";
const SHOW_MORE_SLOTS_CALLBACK: &str = "show_more_slots";
const BACK_TO_FIRST_PAGE_CALLBACK: &str = "back_to_first_page";
const BOOK_CALLBACK_PREFIX: &str = "book_";
const CONFIRM_CALLBACK_PREFIX: &str = "confirm_";

// Функция для форматирования даты в русском стиле "25 сентября 18:30"
fn format_russian_date(datetime: &chrono::DateTime<Utc>) -> String {
    let month_names = [
        "января", "февраля", "марта", "апреля", "мая", "июня",
        "июля", "августа", "сентября", "октября", "ноября", "декабря"
    ];
    
    let day = datetime.day();
    let month = month_names[datetime.month0() as usize];
    let hour = datetime.hour();
    let minute = datetime.minute();
    
    format!("{} {} {}:{}", day, month, hour, format!("{:02}", minute))
}

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
    NoSlotsAvailable(String),
    SlotSelected { time: String, place: String },
    SlotNotFound,
    SlotError,
    BookingConfirmed { time: String, place: String, username: String },
    SlotFull { max_users: u16, current_count: u16 },
    SlotNotFoundError,
    UserNotFound,
    DatabaseError(String),
    Reminder { time: String, place: String },
}

impl UserMessage {
    fn to_string(&self) -> String {
        match self {
            UserMessage::Welcome => WELCOME_MESSAGE.to_string(),
            UserMessage::ContactInfo(username) => CONTACT_INFO_TEMPLATE.replace(USERNAME_PLACEHOLDER, username),
            UserMessage::NoSlotsAvailable(username) => NO_SLOTS_MESSAGE_TEMPLATE.replace(USERNAME_PLACEHOLDER, username),
            UserMessage::SlotSelected { time, place } => SLOT_SELECTED_TEMPLATE.replace(TIME_PLACEHOLDER, time).replace(PLACE_PLACEHOLDER, place),
            UserMessage::SlotNotFound => SLOT_NOT_FOUND_MESSAGE.to_string(),
            UserMessage::SlotError => SLOT_ERROR_MESSAGE.to_string(),
            UserMessage::BookingConfirmed { time, place, username } => BOOKING_CONFIRMED_TEMPLATE.replace(TIME_PLACEHOLDER, time).replace(PLACE_PLACEHOLDER, place).replace(USERNAME_PLACEHOLDER, username),
            UserMessage::SlotFull { max_users, current_count } => {
                let username = std::env::var("CONTACT_USERNAME").unwrap_or_default();
                SLOT_FULL_TEMPLATE.replace(MAX_USERS_PLACEHOLDER, &max_users.to_string()).replace(CURRENT_COUNT_PLACEHOLDER, &current_count.to_string()).replace(USERNAME_PLACEHOLDER, &username)
            },
            UserMessage::SlotNotFoundError => SLOT_NOT_FOUND_ERROR_MESSAGE.to_string(),
            UserMessage::UserNotFound => {
                let username = std::env::var("CONTACT_USERNAME").unwrap_or_default();
                USER_NOT_FOUND_MESSAGE.replace(USERNAME_PLACEHOLDER, &username)
            },
            UserMessage::DatabaseError(error) => {
                let username = std::env::var("CONTACT_USERNAME").unwrap_or_default();
                DATABASE_ERROR_TEMPLATE.replace(ERROR_PLACEHOLDER, error).replace(USERNAME_PLACEHOLDER, &username)
            },
            UserMessage::Reminder { time, place } => REMINDER_TEMPLATE.replace(TIME_PLACEHOLDER, time).replace(PLACE_PLACEHOLDER, place),
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
                InlineKeyboardButton::new(SIGN_UP_BUTTON, InlineKeyboardButtonKind::CallbackData(SIGN_UP_CALLBACK.to_string())),
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
        if data == SIGN_UP_CALLBACK {
            handle_sign_up(&q, bot, pool).await?;
        } else if data == SHOW_MORE_SLOTS_CALLBACK {
            handle_show_more_slots(&q, bot, pool).await?;
        } else if data == BACK_TO_FIRST_PAGE_CALLBACK {
            handle_sign_up(&q, bot, pool).await?;
        } else if data.starts_with(BOOK_CALLBACK_PREFIX) {
            handle_slot_selection(&q, bot, data, pool).await?;
        } else if data.starts_with(CONFIRM_CALLBACK_PREFIX) {
            handle_confirm_booking(&q, bot, data, pool).await?;
        }
    }

    Ok(())
}

async fn handle_sign_up(q: &CallbackQuery, bot: Bot, pool: Arc<SqlitePool>) -> ResponseResult<()> {
    bot.answer_callback_query(q.id.clone()).await?;

    if let Some(msg) = &q.message {
        match core_logic::db::get_best_slots_for_booking(&pool, 6).await {
            Ok(slots) => {
                if !slots.is_empty() {
                    // Показываем первые 3 слота
                    let first_three_slots = &slots[..3.min(slots.len())];
                let mut keyboard_buttons = vec![];

                    for slot in first_three_slots {
                    // Конвертируем UTC время в MSK (+3)
                    let msk_time = slot.time + chrono::Duration::hours(3);
                    let text = format!("📅 {} | 🏢 {}", 
                        format_russian_date(&msk_time), 
                        slot.place
                    );
                    let callback_data = format!("book_{}", slot.id);
                    keyboard_buttons.push(vec![InlineKeyboardButton::new(
                        text,
                        InlineKeyboardButtonKind::CallbackData(callback_data),
                    )]);
                }

                    // Добавляем кнопку "Не удобно" если есть еще слоты
                    if slots.len() > 3 {
                        keyboard_buttons.push(vec![InlineKeyboardButton::new(
                            SHOW_MORE_SLOTS_BUTTON,
                            InlineKeyboardButtonKind::CallbackData(SHOW_MORE_SLOTS_CALLBACK.to_string()),
                        )]);
                    }

                    let keyboard = InlineKeyboardMarkup::new(keyboard_buttons);
                    bot.edit_message_text(msg.chat().id, msg.id(), WELCOME_MESSAGE)
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
                bot.edit_message_text(msg.chat().id, msg.id(), GENERIC_ERROR_MESSAGE).await?;
            }
        }
    }
    Ok(())
}

async fn handle_show_more_slots(q: &CallbackQuery, bot: Bot, pool: Arc<SqlitePool>) -> ResponseResult<()> {
    bot.answer_callback_query(q.id.clone()).await?;

    if let Some(msg) = &q.message {
        match core_logic::db::get_best_slots_for_booking(&pool, 6).await {
            Ok(slots) => {
                if slots.len() > 3 {
                    let mut keyboard_buttons = vec![];
                    
                    // Показываем слоты с 4-го по 6-й
                    for slot in &slots[3..] {
                        // Конвертируем UTC время в MSK (+3)
                        let msk_time = slot.time + chrono::Duration::hours(3);
                        let text = format!("📅 {} | 🏢 {}", 
                            format_russian_date(&msk_time), 
                            slot.place
                        );
                        let callback_data = format!("book_{}", slot.id);
                        keyboard_buttons.push(vec![InlineKeyboardButton::new(
                            text,
                            InlineKeyboardButtonKind::CallbackData(callback_data),
                        )]);
                    }
                    
                    // Добавляем кнопку "Назад к первым слотам"
                    keyboard_buttons.push(vec![InlineKeyboardButton::new(
                        BACK_TO_FIRST_PAGE_BUTTON,
                        InlineKeyboardButtonKind::CallbackData(BACK_TO_FIRST_PAGE_CALLBACK.to_string()),
                    )]);

                    let keyboard = InlineKeyboardMarkup::new(keyboard_buttons);
                    bot.edit_message_text(msg.chat().id, msg.id(), MORE_SLOTS_HEADER)
                        .parse_mode(ParseMode::Html)
                        .reply_markup(keyboard)
                        .await?;
                } else {
                    // Если слотов меньше 4, показываем все и кнопку "Назад"
                    let mut keyboard_buttons = vec![];
                    for slot in &slots {
                        let msk_time = slot.time + chrono::Duration::hours(3);
                        let text = format!("📅 {} | 🏢 {}", 
                            format_russian_date(&msk_time), 
                            slot.place
                        );
                        let callback_data = format!("book_{}", slot.id);
                        keyboard_buttons.push(vec![InlineKeyboardButton::new(
                            text,
                            InlineKeyboardButtonKind::CallbackData(callback_data),
                        )]);
                    }
                    
                    keyboard_buttons.push(vec![InlineKeyboardButton::new(
                        BACK_TO_FIRST_PAGE_BUTTON,
                        InlineKeyboardButtonKind::CallbackData(BACK_TO_FIRST_PAGE_CALLBACK.to_string()),
                    )]);
                    
                    let keyboard = InlineKeyboardMarkup::new(keyboard_buttons);
                    bot.edit_message_text(msg.chat().id, msg.id(), ALL_SLOTS_HEADER)
                        .parse_mode(ParseMode::Html)
                        .reply_markup(keyboard)
                        .await?;
                }
            }
            Err(e) => {
                tracing::error!("Failed to get available slots: {}", e);
                bot.edit_message_text(msg.chat().id, msg.id(), GENERIC_ERROR_MESSAGE).await?;
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
                        // Конвертируем UTC время в MSK (+3)
                        let msk_time = slot.time + chrono::Duration::hours(3);
                        let time = format_russian_date(&msk_time);
                        let place = slot.place.clone();
                        let message = UserMessage::SlotSelected { time, place };
                        let confirm_callback_data = format!("confirm_{}", slot_id);
                        let keyboard = InlineKeyboardMarkup::new(vec![vec![InlineKeyboardButton::new(
                            CONFIRM_BUTTON,
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
                    let telegram_id = q.from.id.0 as i64;
                    let user = match core_logic::db::get_user_by_telegram_id(&pool, telegram_id).await {
                        Ok(Some(user)) => user,
                        Ok(None) => {
                            let new_user = CreateUserRequest {
                                telegram_id: telegram_id,
                                role: 0, // По умолчанию обычный пользователь
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

                    match core_logic::db::create_or_update_booking(&pool, telegram_id, Some(slot_id)).await {
                        Ok(_) => {
                            // Конвертируем UTC время в MSK (+3)
                            let msk_time = slot.time + chrono::Duration::hours(3);
                            let time = format_russian_date(&msk_time);
                            let place = slot.place.clone();
                            let username = env::var("CONTACT_USERNAME").unwrap_or_default();
                            let message = UserMessage::BookingConfirmed { time, place, username };
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
                                    InlineKeyboardButton::new(TRY_AGAIN_BUTTON, InlineKeyboardButtonKind::CallbackData(SIGN_UP_CALLBACK.to_string()))
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
            // Конвертируем UTC время в MSK (+3)
            let msk_time = booking.time + chrono::Duration::hours(3);
            let time = msk_time.format("%H:%M").to_string();
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
