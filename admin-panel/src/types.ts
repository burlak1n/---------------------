export interface Slot {
  id: number;
  time: string; // ISO string
  place: string;
  max_user: number;
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
