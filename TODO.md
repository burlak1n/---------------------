### Phase 1: Bot Setup & Core Logic

*   **Task 1: Setup Core Infrastructure & Project**
    *   [x] Create a `docker-compose.yml` file to run Redis and RabbitMQ.
    *   [ ] Initialize a new Rust project for the Telegram Bot.
    *   [ ] Add dependencies: `teloxide`, `lapin`, `redis-rs`, `serde`, `tokio`, `log`/`tracing`.

*   **Task 2: Create Mock Data**
    *   [ ] Create a local `allowed_users.json` file to act as a mock database for `telegram_id`s.
    *   [ ] Create a local `available_slots.json` file with mock interview slot data.
    *   [ ] Create functions within the bot to read from these mock data files instead of calling an external API.

*   **Task 3: Implement Bot's Core Functionality**
    *   [ ] Implement a new, admin-only `/start_interview` command to trigger the posting of the "Sign Up" message.
    *   [ ] Implement the RabbitMQ publisher to send `admin.booking.event` messages when a user books, reschedules, or cancels.
    *   [ ] On user interaction, use the `allowed_users.json` file to authenticate them.

*   **Task 4: Develop the Booking Flow & State Management**
    *   [ ] Use Redis to manage user state during the booking process (e.g., `waiting_for_slot`, `waiting_for_confirmation`).
    *   [ ] Implement the message handler that shows available slots from `available_slots.json`.
    *   [ ] Add logic for slot selection, confirmation, and updating the message.
    *   [ ] Implement conflict handling (e.g., by tracking booked slots in Redis or updating a temporary copy of the mock data).
    *   [ ] Add logic to make slots unavailable 2 hours before their start time.

*   **Task 5: Implement Bot Commands & Notifications**
    *   [ ] Implement the `/reschedule` command.
    *   [ ] Implement the `/contact` command.
    *   [ ] Create a scheduled task for sending interview reminders.

### Phase 2: Finalizing and Deployment

*   **Task 6: Finalize and Deploy**
    *   [ ] Implement robust logging and error handling.
    *   [ ] Create a `Dockerfile` for the Rust Bot.
    *   [ ] Configure the production environment and deploy the bot.