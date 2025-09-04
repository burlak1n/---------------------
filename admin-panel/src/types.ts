export interface Slot {
  id: number;
  time: string; // ISO string
  place: string;
  max_user: number;
  booked_count?: number; // Количество забронированных мест
}

export interface User {
  telegram_id: number;
  role: number;
  created_at?: string;
  full_name?: string;
  username?: string;
}

export interface Booking {
  slot_id: string;
  telegram_id: number;
}

export interface BookingRecord {
  id: number;
  telegram_id: number;
  slot_id?: number;
  created_at?: string; // ISO string
}

export interface CreateSlotRequest {
  start_time: string; // ISO string
  place: string;
  max_users: number;
}

export interface CreateUserRequest {
  telegram_id: number;
  role: number;
}

export interface CreateBookingRequest {
  slot_id: string;
  telegram_id: number;
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
  role: number;
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
  message_type?: 'custom' | 'signup';
  selected_external_users?: string[]; // telegram_id выбранных внешних пользователей
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
  telegram_id: number;
  username: string;
  full_name: string;
  faculty: string;
  group: string;
  phone: string;
  completed_at: string;
}

export interface ExternalUsersResponse {
  users: ExternalUser[];
  total: number;
  last_sync?: string;
}

// User Survey Types
export interface UserSurvey {
  telegram_id: number;
  username: string;
  full_name: string;
  faculty: string;
  group: string;
  phone: string;
  email?: string;
  birth_date?: string;
  education_level?: string;
  experience?: string;
  skills?: string[];
  interests?: string[];
  completed_at: string;
  // Прямые поля для вопросов
  q5?: string;
  q6?: string;
  q7?: string;
  q8?: string;
  q9?: string;
  survey_data?: {
    q1?: string;
    q9?: string; // JSON строка с данными рисунка
    completion_time_seconds?: number;
    survey_id?: string;
    username?: string;
    request_id?: string;
  };
}

// Survey Structure Types
export interface SurveyValidation {
  pattern?: string | null;
  min_length?: number | null;
  max_length?: number | null;
}

export interface PersonalInfoField {
  key: string;
  label: string;
  required: boolean;
  field_type: 'text' | 'phone';
  validation: SurveyValidation;
}

export interface SurveyQuestion {
  type: 'Text' | 'Choice' | 'Creative';
  id: string;
  number: number;
  text: string;
  required: boolean;
  options?: string[];
  allow_custom?: boolean;
  multiple?: boolean;
  formats?: string[];
}

export interface SurveyConfig {
  personal_info: PersonalInfoField[];
  questions: SurveyQuestion[];
  timer_seconds: number;
}

export interface SurveyStructure {
  _id: string;
  title: string;
  version: string;
  is_active: boolean;
  created_at: string;
  config: SurveyConfig;
}

export interface SurveyStatistics {
  total_responses: number;
  completion_rate: number;
  average_completion_time: number;
  question_stats: Record<string, {
    response_count: number;
    average_rating?: number;
    top_choices?: string[];
    completion_rate: number;
  }>;
}

// Voting System Types
export interface Vote {
  id: number;
  survey_id: number;                    // Telegram ID владельца анкеты
  voter_telegram_id: number;            // Telegram ID голосующего
  decision: number;                     // 1 - approve, 0 - reject
  comment?: string;
  created_at: string;
}

export interface UserRole {
  telegram_id: number;
  role: number;                         // 0 - обычный, 1 - ответственный
  created_at: string;
}

export interface CreateVoteRequest {
  survey_id: number;                    // Telegram ID владельца анкеты
  decision: number;                     // 1 - approve, 0 - reject
  comment?: string;
}

export interface SurveyVoteSummary {
  survey_id: number;                    // Telegram ID владельца анкеты
  total_votes: number;
  approve_votes: number;
  reject_votes: number;
  status: SurveyStatus;
  has_responsible_vote: boolean;        // Есть ли голос от ответственного
}

export type SurveyStatus = 'InProgress' | 'ReadyForReview' | 'Completed';

export interface NextSurveyResponse {
  survey_id?: number;
  survey_data?: UserSurvey;
  vote_summary?: SurveyVoteSummary;
  user_role: number;                    // 0 - обычный, 1 - ответственный
}

export interface VoteResponse {
  success: boolean;
  message: string;
  next_survey?: NextSurveyResponse;
}

// Authentication Types
export interface TelegramAuth {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
}

export interface UserProfile {
  telegram_id: number;
  telegram_nickname: string;
  vk_nickname: string;
  status: number;
  full_name: string;
  phone_number: string;
  live_metro_station: number[];
  study_metro_station: number[];
  year_of_admission: number;
  has_driver_license: number;
  date_of_birth: string;
  has_printer: number;
  can_host_night: boolean;
}

export interface ExternalUserResponse {
  user_profile: UserProfile;
}

export interface AuthResponse {
  success: boolean;
  message: string;
  user_profile?: UserProfile;
  user_role?: number;
}
