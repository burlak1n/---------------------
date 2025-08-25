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
  BroadcastSummary,
  // External API types
  ExternalUser,
} from './types';

const api = axios.create({
  baseURL: 'http://localhost:3000',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Отдельный instance для внешнего API
const externalApi = axios.create({
  baseURL: 'https://ingroupsts.ru',
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
  getAllSlots: async (): Promise<Slot[]> => {
    const response = await api.get<Slot[]>('/slots/all');
    return response.data;
  },
  getBest: async (): Promise<Slot[]> => {
    const response = await api.get<Slot[]>('/slots/best');
    return response.data;
  },
  create: async (slot: CreateSlotRequest): Promise<Slot> => {
    try {
      const response = await api.post<Slot>('/slots', slot);
      return response.data;
    } catch (error: any) {
      if (error.response?.data) {
        throw new Error(error.response.data);
      }
      throw new Error('Ошибка при создании слота');
    }
  },
  update: async (id: number, slot: UpdateSlotRequest): Promise<Slot> => {
    try {
      console.log(`Отправляем PUT запрос на /slots/${id}:`, slot);
      const response = await api.put<Slot>(`/slots/${id}`, slot);
      console.log('Ответ сервера:', response.data);
      return response.data;
    } catch (error: any) {
      console.error('Ошибка API при обновлении слота:', error);
      if (error.response?.data) {
        throw new Error(error.response.data);
      }
      if (error.response?.status) {
        throw new Error(`HTTP ${error.response.status}: ${error.message}`);
      }
      throw new Error('Ошибка при обновлении слота');
    }
  },
  delete: async (id: number): Promise<void> => {
    try {
      await api.delete(`/slots/${id}`);
    } catch (error: any) {
      if (error.response?.data) {
        throw new Error(error.response.data);
      }
      throw new Error('Ошибка при удалении слота');
    }
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

  // Удаление рассылки
  delete: async (broadcastId: string): Promise<void> => {
    await api.delete(`/broadcast/${broadcastId}`);
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

// External Users API
export const externalUsersApi = {
  // Получение пользователей с завершенными анкетами
  getCompletedUsers: async (): Promise<ExternalUser[]> => {
    try {
      const response = await externalApi.get<ExternalUser[]>('/api/users/completed');
      return response.data;
    } catch (error: any) {
      console.error('Error fetching external users:', error);
      throw new Error(error.response?.data || 'Ошибка при получении пользователей из внешнего API');
    }
  },

  // Получение пользователей с кэшированием
  getCompletedUsersCached: async (): Promise<ExternalUser[]> => {
    const cacheKey = 'external_users_cache';
    const cacheTimeout = 5 * 60 * 1000; // 5 минут

    // Проверяем кэш
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      const { data, timestamp } = JSON.parse(cached);
      if (Date.now() - timestamp < cacheTimeout) {
        return data;
      }
    }

    // Получаем свежие данные
    const users = await externalUsersApi.getCompletedUsers();
    
    // Сохраняем в кэш
    localStorage.setItem(cacheKey, JSON.stringify({
      data: users,
      timestamp: Date.now()
    }));

    return users;
  },

  // Очистка кэша
  clearCache: (): void => {
    localStorage.removeItem('external_users_cache');
  },

  // Проверка доступности внешнего API
  checkHealth: async (): Promise<boolean> => {
    try {
      await externalApi.get('/api/users/completed');
      return true;
    } catch {
      return false;
    }
  }
};
