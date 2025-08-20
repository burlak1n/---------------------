-- Add migration script here

-- Event Store для рассылок
CREATE TABLE IF NOT EXISTS broadcast_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id TEXT NOT NULL UNIQUE,
    broadcast_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    event_data TEXT NOT NULL, -- JSON данные события
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    version INTEGER NOT NULL DEFAULT 1
);

-- Read Model для быстрых запросов статуса рассылок
CREATE TABLE IF NOT EXISTS broadcast_summaries (
    id TEXT PRIMARY KEY,
    message TEXT NOT NULL,
    total_users INTEGER NOT NULL,
    sent_count INTEGER DEFAULT 0,
    failed_count INTEGER DEFAULT 0,
    pending_count INTEGER DEFAULT 0,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'failed')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    started_at DATETIME,
    completed_at DATETIME
);

-- Read Model для детальной статистики сообщений
CREATE TABLE IF NOT EXISTS broadcast_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    broadcast_id TEXT NOT NULL,
    user_id INTEGER NOT NULL,
    telegram_id INTEGER,
    status TEXT NOT NULL CHECK (status IN ('pending', 'sent', 'failed', 'retrying')),
    error TEXT,
    sent_at DATETIME,
    retry_count INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Таблица для отслеживания обработанных событий (для идемпотентности)
CREATE TABLE IF NOT EXISTS processed_events (
    event_id TEXT PRIMARY KEY,
    processed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    worker_id TEXT NOT NULL
);

-- Создание индексов для broadcast_events
CREATE INDEX IF NOT EXISTS idx_broadcast_events_broadcast_id ON broadcast_events(broadcast_id);
CREATE INDEX IF NOT EXISTS idx_broadcast_events_created_at ON broadcast_events(created_at);
CREATE INDEX IF NOT EXISTS idx_broadcast_events_event_type ON broadcast_events(event_type);

-- Создание индексов для broadcast_summaries
CREATE INDEX IF NOT EXISTS idx_broadcast_summaries_status ON broadcast_summaries(status);
CREATE INDEX IF NOT EXISTS idx_broadcast_summaries_created_at ON broadcast_summaries(created_at);

-- Создание индексов для broadcast_messages
CREATE INDEX IF NOT EXISTS idx_broadcast_messages_broadcast_id ON broadcast_messages(broadcast_id);
CREATE INDEX IF NOT EXISTS idx_broadcast_messages_user_id ON broadcast_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_broadcast_messages_status ON broadcast_messages(status);
CREATE INDEX IF NOT EXISTS idx_broadcast_messages_broadcast_user ON broadcast_messages(broadcast_id, user_id);
