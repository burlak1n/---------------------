-- Создание системы голосования для проверки анкет
-- Таблица для хранения всех голосов
CREATE TABLE IF NOT EXISTS votes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    survey_id INTEGER NOT NULL,                    -- Telegram ID владельца анкеты
    voter_telegram_id INTEGER NOT NULL,            -- Telegram ID голосующего
    decision INTEGER NOT NULL,                     -- 1 - approve, 0 - reject
    comment TEXT,                                  -- Комментарий от голосующего
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Таблица ролей пользователей
CREATE TABLE IF NOT EXISTS user_roles (
    telegram_id INTEGER PRIMARY KEY,               -- Telegram ID пользователя
    role INTEGER NOT NULL,                         -- 0 - обычный пользователь, 1 - ответственный
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Индексы для оптимизации запросов
CREATE INDEX IF NOT EXISTS idx_votes_survey_id ON votes(survey_id);
CREATE INDEX IF NOT EXISTS idx_votes_voter_telegram_id ON votes(voter_telegram_id);
CREATE INDEX IF NOT EXISTS idx_votes_decision ON votes(decision);
CREATE INDEX IF NOT EXISTS idx_votes_created_at ON votes(created_at);
CREATE INDEX IF NOT EXISTS idx_user_roles_role ON user_roles(role);

-- Уникальный индекс: один пользователь может голосовать за анкету только один раз
CREATE UNIQUE INDEX IF NOT EXISTS idx_votes_survey_voter ON votes(survey_id, voter_telegram_id);

-- Вставка базовых ролей (опционально)
INSERT OR IGNORE INTO user_roles (telegram_id, role) VALUES 
(123456789, 1),  -- Пример: пользователь с ролью ответственного
(987654321, 0);  -- Пример: обычный пользователь
