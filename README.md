Отлично! Спасибо за подробные ответы. На основе ваших требований и уточнений я составил подробное техническое задание на английском языке.

---

### **Technical Specification: Telegram Interview Booking Bot**

**Version:** 1.0
**Date:** 2024-05-25
**Status:** Approved

### 1. Project Overview

This document describes the requirements for a Telegram Bot developed in Rust. The bot's primary function is to manage the booking process for interview slots, providing a seamless user experience within Telegram and integrating with a separate administrative web service via RabbitMQ and MongoDB.

### 2. Goals & Objectives

*   **Primary Goal:** To automate the process of scheduling interviews via a Telegram bot, reducing manual coordination.
*   **User Goal:** To allow pre-approved candidates to easily view available interview slots, book, and reschedule their appointments.
*   **Admin Goal:** To provide administrators with a web interface to configure available slots and monitor bookings.
*   **Technical Goal:** To create a reliable, maintainable, and efficient system using Rust, with clear separation of concerns and integration points via message queues and databases.

### 3. Definitions & Abbreviations

*   **Slot:** A specific time interval on a given date available for booking (e.g., "2023-10-26 14:00-15:00").
*   **Admin Service:** The separate backend service with a web interface, responsible for configuration and data persistence.
*   **Bot:** The Rust application implementing the Telegram Bot logic.
*   **User:** A candidate with a pre-approved `telegram_id` who interacts with the bot.

### 4. System Architecture

The system consists of two main components:
1.  **Telegram Bot (Rust):** Handles all user interaction, state management, and real-time messaging.
2.  **Admin Service (External):** Provides a web admin panel, manages configuration, and persists final booking data. It uses **MongoDB** as its primary database, **RabbitMQ** for async communication with the bot, and **Redis** for caching.

**Data Flow:**
1.  Admin configures a new interview event with slots in the Admin Service web interface.
2.  Admin triggers a "broadcast" from the web interface. The Admin Service sends a message payload to a RabbitMQ queue (`bot.broadcast.command`).
3.  The Bot consumes this message and posts a new interactive message to a predefined Telegram channel/chat.
4.  A user clicks the "Sign Up" button in the broadcast message.
5.  The Bot interacts with the user, using Redis to manage temporary state and checking slot availability by querying the Admin Service's API or a cached copy of slots in Redis.
6.  Upon successful booking, the Bot publishes a `booking.created` event to a RabbitMQ queue (`admin.booking.event`) for the Admin Service to consume and store in MongoDB.
7.  The Admin Service provides a web UI to view all bookings and manage slots.

### 5. Functional Requirements

**5.1. User Booking Flow (Telegram Bot)**
*   **FR1: Initiation.** The bot shall post a broadcast message with a "Sign Up" button. This message must be sent only after being commanded by the Admin Service via RabbitMQ.
*   **FR2: Authentication.** The bot shall only process button clicks and commands from users whose `telegram_id` is present in an allow list provided by the Admin Service (via an API endpoint or cached in Redis).
*   **FR3: Slot Selection.**
    *   Upon clicking "Sign Up", the original message shall be edited to show the user the next 3 available slots across all dates.
    *   Buttons for dates with fewer than 3 available slots shall be filled with slots from subsequent dates.
    *   Each slot button must display the time, location, and room/audience number.
*   **FR4: Booking Confirmation.**
    *   After selecting a slot, the message shall be edited again to show the chosen date, time, location, and a final "Confirm" button.
    *   Upon confirmation, the keyboard shall be removed from the message, and a success message shall be displayed, including a command (e.g., `/reschedule`) for future use.
*   **FR5: Conflict Handling.** If a user selects a slot that was just taken, the bot shall display an error message ("Sorry, this slot is no longer available") and refresh the interface with current available slots.
*   **FR6: Rescheduling.** The `/reschedule` command shall clear the user's existing booking and restart the booking flow (FR3).
*   **FR7: Contact Request.** If no slots are suitable, a message within the bot shall instruct the user to use a command (e.g., `/contact`). Using this command shall send the user a link to the Telegram account of the responsible person.
*   **FR8: Notification.** The bot shall send a reminder notification to the user at 11:00 AM MSK on the day of their interview. The notification shall include the interview time and other relevant details.
*   **FR9: Slot Availability.** A slot shall become unavailable for new bookings 2 hours before its start time.

**5.2. Admin Service Integration**
*   **FR10: Slot Management.** The Admin Service's web interface must allow authorized admins to:
    *   Create and configure interview events with multiple dates and slots.
    *   Define the maximum number of people per slot.
    *   Set the location and audience for each slot.
    *   Edit or deactivate future slots. Attempting to delete a slot with existing bookings must result in a warning showing the affected users, not a deletion.
*   **FR11: Data Visibility.** The Admin Service's web interface must provide a view of all bookings, showing user info (`telegram_id`, likely `username`) and their assigned slot details.
*   **FR12: Communication.** The Admin Service must communicate with the Bot via RabbitMQ:
    *   **Consume:** `admin.booking.event` (events: `created`, `cancelled`, `rescheduled`).
    *   **Publish:** `bot.broadcast.command` (to trigger a new broadcast message).

### 6. Non-Functional Requirements

*   **NFR1: Performance.** The bot must respond to user interactions (button presses) within 2 seconds.
*   **NFR2: Reliability.** The system must ensure no double-booking of slots. The state of slot availability must be consistent between the Bot and the Admin Service.
*   **NFR3: Security:**
    *   Access to the bot's functionality must be restricted to users on the allow list.
    *   Communication between services (especially involving RabbitMQ) should be considered for authentication mechanisms.
*   **NFR4: Maintainability:** The Rust code must be well-structured, use common idioms, and have logging (`log`, `tracing`) implemented for debugging.

### 7. Data Schemas & Storage

**7.1. Redis (Bot's State Cache)**
*   **Key:** `slots:cache`
    *   **Type:** String (JSON)
    *   **Value:** `[{ "date": "2023-10-26", "slots": [{"time": "14:00", "max": 10, "booked": 4, "location": "Office A"}, ...] }, ...]`
*   **Key:** `user:{user_id}:state`
    *   **Type:** String
    *   **Value:** `"waiting_for_slot" | "waiting_for_confirmation"`
*   **Key:** `user:{user_id}:temp_data`
    *   **Type:** String (JSON)
    *   **Value:** `{"selected_date": "2023-10-26", "selected_slot": "14:00"}`

**7.2. MongoDB (Admin Service's Database)**
*   **Collection:** `users`
    *   `{ "_id": ObjectId, "telegram_id": Number, "username": String, "first_name": String, ... }`
*   **Collection:** `bookings`
    *   `{ "_id": ObjectId, "user_id": ObjectId (ref->users), "date": ISODate, "time": String, "location": String, "status": "booked" | "cancelled" }`
*   **Collection:** `interview_slots`
    *   `{ "_id": ObjectId, "date": ISODate, "time": String, "max_users": Number, "booked_users": [ObjectId], "location": String, "is_active": Boolean }`

### 8. API / Integration Details

**8.1. RabbitMQ Messages**

*   **Queue:** `admin.booking.event`
    *   **Published by:** Bot
    * **Message Format (JSON):**
      ```json
      {
        "event_type": "booking.created", // or "cancelled", "rescheduled"
        "user_telegram_id": 123456789,
        "timestamp": "2023-10-25T10:00:00Z",
        "payload": {
          "old_date": null, // populated for "rescheduled"
          "old_time": null,
          "new_date": "2023-10-26",
          "new_time": "14:00",
          "location": "Office A"
        }
      }
      ```

*   **Queue:** `bot.broadcast.command`
    *   **Published by:** Admin Service
    *   **Consumed by:** Bot
    *   **Message Format (JSON):**
      ```json
      {
        "action": "post_broadcast",
        "message_text": "Sign up for interviews!",
        // ... other potential fields for message formatting
      }
      ```

**8.2. REST API Endpoints (Provided by Admin Service)**
*   `GET /api/allowed-users` - Returns a list of allowed `telegram_id`s. (For bot authentication, FR2).
*   `GET /api/available-slots` - Returns a list of active, available slots. (For bot to cache and use, FR3).
*   `POST /api/confirm-booking` - (Optional, an alternative to RabbitMQ) Endpoint for the bot to directly confirm a booking.

### 9. Deployment Considerations

*   The Bot will run as a single, long-running process.
*   All time-based logic (slot closure, 11:00 notifications) must use the MSK (Moscow Time) timezone.
*   The Bot must be deployed in an environment with stable connectivity to the Telegram API, Redis, and RabbitMQ.

---
This specification provides a solid foundation for development. The next step would be to break these requirements down into specific tasks for implementation.