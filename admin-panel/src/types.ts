export interface Slot {
  id: number;
  time: string; // ISO string
  place: string;
  max_user: number;
  booked_count?: number; // Количество забронированных мест
}

export interface User {
  id: number;
  name: string;
  telegram_id?: number;
}

export interface Booking {
  slot_id: string;
  user_id: number;
}

export interface BookingRecord {
  id: number;
  user_id: number;
  slot_id?: number;
  created_at?: string; // ISO string
}

export interface CreateSlotRequest {
  start_time: string; // ISO string
  place: string;
  max_users: number;
}

export interface CreateUserRequest {
  name: string;
  telegram_id?: number;
}

export interface CreateBookingRequest {
  slot_id: string;
  user_id: number;
}

export interface ApiResponse<T> {
  data?: T;
  error?: string;
}

export interface UpdateSlotRequest {
  start_time?: string; // ISO string
  place?: string;
  max_users?: number;
}

export interface UpdateUserRequest {
  name?: string;
  telegram_id?: number;
}

export interface BroadcastRequest {
  message: string;
  include_users_without_telegram: boolean;
}

export interface BroadcastResponse {
  success: boolean;
  message: string;
  users_count: number;
  users_with_telegram: number;
  users_without_telegram: number;
}

// Event-Driven Broadcast Types
export interface CreateBroadcastCommand {
  message: string;
  include_users_without_telegram: boolean;
  message_type?: 'custom' | 'signup';
  selected_users?: number[]; // ID выбранных пользователей
}

export interface BroadcastCreatedResponse {
  broadcast_id: string;
  status: BroadcastStatus;
}

export interface BroadcastSummary {
  id: string;
  message: string;
  total_users: number;
  sent_count: number;
  failed_count: number;
  pending_count: number;
  status: BroadcastStatus;
  created_at: string;
  started_at?: string;
  completed_at?: string;
}

export interface BroadcastStatusResponse {
  broadcast: BroadcastSummary;
  messages: BroadcastMessageRecord[];
}

export interface BroadcastMessageRecord {
  id: number;
  broadcast_id: string;
  user_id: number;
  telegram_id?: number;
  status: MessageStatus;
  error?: string;
  sent_at?: string;
  retry_count: number;
  created_at: string;
}

export type BroadcastStatus = 'pending' | 'in_progress' | 'completed' | 'failed';

export type MessageStatus = 'pending' | 'sent' | 'failed' | 'retrying';

export interface RetryMessageCommand {
  broadcast_id: string;
  user_id: number;
}

// External API Types
export interface ExternalUser {
  _id: {
    $oid: string;
  };
  telegram_id: number;
  created_at: string;
  completed_surveys: string[];
}

export interface ExternalUsersResponse {
  users: ExternalUser[];
  total: number;
  last_sync?: string;
}
