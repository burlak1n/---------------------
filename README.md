# Система записи на собеседования

Система для управления записями на собеседования с Telegram-ботом и административной панелью.

## Архитектура

### Компоненты системы

1. **Telegram Bot** (`telegram_bot/`) - основной бот для пользователей
   - Обработка команд и callback-запросов
   - Автоматические напоминания
   - **Broadcast Worker** - обработка массовых рассылок

2. **API Server** (`api_server/`) - REST API и административная логика
   - REST API для админ-панели
   - **Event Worker** - координация рассылок через события

3. **Admin Panel** (`admin-panel/`) - веб-интерфейс для администраторов
   - React + TypeScript
   - Управление слотами, пользователями, рассылками

4. **Core Logic** (`core_logic/`) - общая бизнес-логика
   - Структуры данных
   - Функции работы с БД
   - Event-driven архитектура

### Поток данных для рассылок

```
Admin Panel → API Server → Event Worker → RabbitMQ → Telegram Bot (Broadcast Worker) → Telegram API
```

**Event Worker**:
- Обрабатывает события `BroadcastCreated`
- Получает пользователей из БД
- Отправляет сообщения в очередь RabbitMQ

**Telegram Bot (Broadcast Worker)**:
- Слушает очередь `telegram_broadcast`
- Отправляет сообщения через Telegram API
- Обновляет статусы в БД

## Запуск

### Предварительные требования
- Rust
- Node.js
- SQLite
- RabbitMQ

### Переменные окружения
```bash
# .env
DATABASE_URL=sqlite:./data.db
RABBITMQ_URL=amqp://localhost:5672
TELEGRAM_BOT_TOKEN=your_bot_token
CONTACT_USERNAME=admin_username
```

### Запуск сервисов

1. **Telegram Bot** (включает broadcast worker):
```bash
cd telegram_bot
cargo run
```

2. **API Server** (включает event worker):
```bash
cd api_server
cargo run
```

3. **Admin Panel**:
```bash
cd admin-panel
npm install
npm run dev
```

## Преимущества новой архитектуры

- **Единая точка входа** для всех Telegram-операций
- **Упрощенное развертывание** - меньше сервисов
- **Переиспользование кода** - общие зависимости
- **Четкое разделение ответственности**:
  - Event Worker: координация рассылок
  - Telegram Bot: отправка сообщений
  - Admin Panel: управление данными