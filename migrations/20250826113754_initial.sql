-- Миграция для создания новой схемы без user_id
-- Теперь система работает только с telegram_id

-- 1. Создаем таблицу broadcast_messages без user_id
CREATE TABLE IF NOT EXISTS broadcast_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    broadcast_id TEXT NOT NULL,
    telegram_id INTEGER NOT NULL,
    status TEXT NOT NULL,
    error TEXT,
    sent_at DATETIME,
    retry_count INTEGER NOT NULL DEFAULT 0,
    message_type TEXT,
    created_at DATETIME NOT NULL
);

-- Создаем индексы для broadcast_messages
CREATE INDEX IF NOT EXISTS idx_broadcast_messages_broadcast_id ON broadcast_messages(broadcast_id);
CREATE INDEX IF NOT EXISTS idx_broadcast_messages_telegram_id ON broadcast_messages(telegram_id);
CREATE INDEX IF NOT EXISTS idx_broadcast_messages_status ON broadcast_messages(status);
CREATE INDEX IF NOT EXISTS idx_broadcast_messages_created_at ON broadcast_messages(created_at);

-- 2. Создаем таблицу records с telegram_id вместо user_id
CREATE TABLE IF NOT EXISTS records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_id INTEGER NOT NULL,
    slot_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (slot_id) REFERENCES slots(id) ON DELETE CASCADE
);

-- Создаем индексы для records
CREATE INDEX IF NOT EXISTS idx_records_telegram_id ON records(telegram_id);
CREATE INDEX IF NOT EXISTS idx_records_slot_id ON records(slot_id);
CREATE INDEX IF NOT EXISTS idx_records_created_at ON records(created_at);

-- 3. Создаем таблицу slots
CREATE TABLE IF NOT EXISTS slots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    time DATETIME NOT NULL,
    place TEXT NOT NULL,
    max_user INTEGER NOT NULL
);

-- Создаем индексы для slots
CREATE INDEX IF NOT EXISTS idx_slots_time ON slots(time);
CREATE INDEX IF NOT EXISTS idx_slots_place ON slots(place);

-- 4. Создаем таблицу broadcast_events
CREATE TABLE IF NOT EXISTS broadcast_events (
    event_id TEXT PRIMARY KEY,
    broadcast_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    event_data TEXT NOT NULL,
    created_at DATETIME NOT NULL,
    version INTEGER NOT NULL
);

-- Создаем индексы для broadcast_events
CREATE INDEX IF NOT EXISTS idx_broadcast_events_broadcast_id ON broadcast_events(broadcast_id);
CREATE INDEX IF NOT EXISTS idx_broadcast_events_created_at ON broadcast_events(created_at);

-- 5. Создаем таблицу processed_events
CREATE TABLE IF NOT EXISTS processed_events (
    event_id TEXT NOT NULL,
    worker_id TEXT NOT NULL,
    processed_at DATETIME NOT NULL,
    PRIMARY KEY (event_id, worker_id)
);

-- 6. Создаем таблицу broadcast_summaries
CREATE TABLE IF NOT EXISTS broadcast_summaries (
    id TEXT PRIMARY KEY,
    message TEXT NOT NULL,
    total_users INTEGER NOT NULL,
    sent_count INTEGER NOT NULL DEFAULT 0,
    failed_count INTEGER NOT NULL DEFAULT 0,
    pending_count INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL,
    created_at DATETIME NOT NULL,
    started_at DATETIME,
    completed_at DATETIME
);

-- Создаем индексы для broadcast_summaries
CREATE INDEX IF NOT EXISTS idx_broadcast_summaries_status ON broadcast_summaries(status);
CREATE INDEX IF NOT EXISTS idx_broadcast_summaries_created_at ON broadcast_summaries(created_at);
