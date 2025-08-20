import axios from 'axios';
import type {
  Slot,
  User,
  BookingRecord,
  CreateSlotRequest,
  CreateUserRequest,
  CreateBookingRequest,
  UpdateSlotRequest,
  UpdateUserRequest,
  BroadcastRequest,
  BroadcastResponse,
  // Event-Driven types
  CreateBroadcastCommand,
  BroadcastCreatedResponse,
  BroadcastStatusResponse,
  BroadcastMessageRecord,
  RetryMessageCommand,
  CancelBroadcastCommand,
  BroadcastSummary,
} from './types';

const api = axios.create({
  baseURL: 'http://localhost:3000',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Slots API
export const slotsApi = {
  getAll: async (): Promise<Slot[]> => {
    const response = await api.get<Slot[]>('/slots');
    return response.data;
  },
  create: async (slot: CreateSlotRequest): Promise<Slot> => {
    const response = await api.post<Slot>('/slots', slot);
    return response.data;
  },
  update: async (id: number, slot: UpdateSlotRequest): Promise<Slot> => {
    const response = await api.put<Slot>(`/slots/${id}`, slot);
    return response.data;
  },
  delete: async (id: number): Promise<void> => {
    await api.delete(`/slots/${id}`);
  },
};

// Users API
export const usersApi = {
  getAll: async (): Promise<User[]> => {
    const response = await api.get<User[]>('/users');
    return response.data;
  },
  create: async (user: CreateUserRequest): Promise<User> => {
    const response = await api.post<User>('/users', user);
    return response.data;
  },
  update: async (id: number, user: UpdateUserRequest): Promise<User> => {
    const response = await api.put<User>(`/users/${id}`, user);
    return response.data;
  },
  delete: async (id: number): Promise<void> => {
    await api.delete(`/users/${id}`);
  },
};

// Bookings API
export const bookingsApi = {
  getAll: async (): Promise<BookingRecord[]> => {
    const response = await api.get<BookingRecord[]>('/bookings');
    return response.data;
  },
  create: async (booking: CreateBookingRequest): Promise<BookingRecord> => {
    const response = await api.post<BookingRecord>('/bookings', booking);
    return response.data;
  },
  delete: async (id: number): Promise<void> => {
    await api.delete(`/bookings/${id}`);
  },
};

// Event-Driven Broadcast API
export const broadcastApi = {
  // Получение всех рассылок
  getAll: async (): Promise<BroadcastSummary[]> => {
    const response = await api.get<BroadcastSummary[]>('/broadcast');
    return response.data;
  },
  
  // Создание рассылки
  create: async (command: CreateBroadcastCommand): Promise<BroadcastCreatedResponse> => {
    const response = await api.post<BroadcastCreatedResponse>('/broadcast', command);
    return response.data;
  },
  
  // Получение статуса рассылки
  getStatus: async (broadcastId: string): Promise<BroadcastStatusResponse | null> => {
    const response = await api.get<BroadcastStatusResponse | null>(`/broadcast/${broadcastId}/status`);
    return response.data;
  },
  
  // Получение сообщений рассылки
  getMessages: async (broadcastId: string): Promise<BroadcastMessageRecord[]> => {
    const response = await api.get<BroadcastMessageRecord[]>(`/broadcast/${broadcastId}/messages`);
    return response.data;
  },
  
  // Повторная отправка сообщения
  retryMessage: async (broadcastId: string, userId: number): Promise<void> => {
    const command: RetryMessageCommand = { broadcast_id: broadcastId, user_id: userId };
    await api.post(`/broadcast/${broadcastId}/retry`, command);
  },
  
  // Отмена рассылки
  cancel: async (broadcastId: string): Promise<void> => {
    await api.post(`/broadcast/${broadcastId}/cancel`);
  },
  
  // Legacy method for backward compatibility
  send: async (request: BroadcastRequest): Promise<BroadcastResponse> => {
    const response = await api.post<BroadcastResponse>('/broadcast', request);
    return response.data;
  },
};
