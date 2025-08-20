-- Создание таблицы слотов
CREATE TABLE IF NOT EXISTS slots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    time TEXT NOT NULL,
    place TEXT NOT NULL,
    max_user INTEGER NOT NULL CHECK (max_user > 0)
);

-- Создание таблицы пользователей
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL CHECK (length(name) > 0),
    telegram_id INTEGER UNIQUE CHECK (telegram_id > 0)
);

-- Создание таблицы записей/бронирований
CREATE TABLE IF NOT EXISTS records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    slot_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (slot_id) REFERENCES slots(id) ON DELETE CASCADE
);

-- Создание индексов для оптимизации
CREATE INDEX IF NOT EXISTS idx_users_telegram_id ON users(telegram_id);
CREATE INDEX IF NOT EXISTS idx_records_user_id ON records(user_id);
CREATE INDEX IF NOT EXISTS idx_records_slot_id ON records(slot_id);
CREATE INDEX IF NOT EXISTS idx_records_created_at ON records(created_at);

-- Создание уникального ограничения на одну запись пользователя на слот
CREATE UNIQUE INDEX IF NOT EXISTS idx_records_user_slot_unique ON records(user_id, slot_id) WHERE slot_id IS NOT NULL;
