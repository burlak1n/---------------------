  Phase 1: Backend and Core Logic (Admin Service)

  This phase focuses on building the backbone of the system. The bot will be unable to
  function until these pieces are in place.

   * Task 1: Setup Core Infrastructure
       * [ ] Initialize a new project for the Admin Service.
       * [ ] Create a docker-compose.yml file to run MongoDB, Redis, and RabbitMQ for
         local development.

   * Task 2: Implement Database Schemas
       * [ ] Define and implement the MongoDB schemas for users, bookings, and
         interview_slots as specified in the document (7.2).

   * Task 3: Build Admin Service APIs
       * [ ] Create the GET /api/allowed-users endpoint to provide the user allow list to
         the bot (FR2).
       * [ ] Create the GET /api/available-slots endpoint for the bot to fetch available
         interview slots (FR3).

   * Task 4: Implement Core Slot Management Logic
       * [ ] Develop the backend logic for creating, configuring, and editing interview
         slots (date, time, capacity, location) (FR10).
       * [ ] Implement the safety check to prevent the deletion of slots that already
         have bookings (FR10).

   * Task 5: Implement RabbitMQ Integration (Admin Side)
       * [ ] Implement the RabbitMQ consumer to listen for admin.booking.event messages
         from the bot (created, cancelled, rescheduled) and update the MongoDB database
         accordingly (FR12).
       * [ ] Implement the RabbitMQ publisher to send the bot.broadcast.command to the
         bot, which will trigger the interview announcement (FR1, FR12).

  Phase 2: Telegram Bot Implementation (Rust)

  With the backend services ready, work on the user-facing bot can begin.

   * Task 6: Setup Rust Bot Project
       * [ ] Initialize a new Rust project.
       * [ ] Add necessary dependencies: a Telegram bot library (teloxide), RabbitMQ
         client (lapin), Redis client (redis), serialization (serde, serde_json), async
         runtime (tokio), and logging (tracing).

   * Task 7: Implement Bot's RabbitMQ Integration
       * [ ] Create a RabbitMQ consumer to listen for bot.broadcast.command and trigger
         the posting of the "Sign Up" message in the designated chat (FR1).
       * [ ] Create a RabbitMQ publisher to send admin.booking.event messages when a
         user confirms, reschedules, or cancels a booking (FR4, FR6).

   * Task 8: Implement User Authentication & State
       * [ ] On interaction, fetch the telegram_id allow list from the Admin Service API
         and cache it (e.g., in Redis) to authenticate users (FR2).
       * [ ] Use Redis to manage user state during the booking process (e.g.,
         waiting_for_slot, waiting_for_confirmation) (7.1).

   * Task 9: Develop the Core Booking Flow
       * [ ] Implement the main message handler that shows the next 3 available slots
         when a user clicks "Sign Up" (FR3).
       * [ ] Add logic to handle slot selection, display the confirmation message, and
         update the message to a "booked" state (FR4).
       * [ ] Implement conflict handling to prevent double bookings if a slot is taken
         during the selection process (FR5).
       * [ ] Add logic to make slots unavailable 2 hours before their start time (FR9).

   * Task 10: Implement Bot Commands & Notifications
       * [ ] Implement the /reschedule command to restart the booking flow for a user
         (FR6).
       * [ ] Implement the /contact command to provide contact information (FR7).
       * [ ] Create a scheduled task that runs daily to send reminders to users at 11:00
         AM MSK on the day of their interview (FR8).

  Phase 3: Admin Web Interface & Deployment

  This final phase involves creating the UI for administrators and preparing for
  deployment.

   * Task 11: Build Admin Web UI
       * [ ] Create a web interface for slot management (creating, editing, deactivating
         slots) (FR10).
       * [ ] Build a dashboard to view all current bookings with user details (FR11).
       * [ ] Add a button or control in the UI to trigger the bot.broadcast.command via
         the backend.

   * Task 12: Finalize and Deploy
       * [ ] Implement robust logging and error handling for both services (NFR4).
       * [ ] Create Dockerfiles for both the Rust Bot and the Admin Service.
       * [ ] Configure the production environment and deploy the entire system.

  This task list provides a clear path from initial setup to a fully functional,
  deployed system.