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
  UserSurvey,
  SurveyStructure,
  SurveyStatistics,
} from './types';
import { CSVDataManager, type ParsedSurveyResponse } from './utils/csvUtils';

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
  // Флаг для переключения между внешним API и CSV режимом
  useCSVMode: false,
  
  // CSV менеджер для работы с локальными данными
  csvManager: CSVDataManager.getInstance(),

  // Получение пользователей с завершенными анкетами
  getCompletedUsers: async (): Promise<ExternalUser[]> => {
    if (externalUsersApi.useCSVMode) {
      const csvData = await externalUsersApi.csvManager.loadData();
      return csvData
        .filter(user => user.telegram_id > 0)
        .map(user => ({
          telegram_id: user.telegram_id,
          full_name: user.full_name,
          faculty: user.faculty,
          group: user.group,
          phone: user.phone,
          completed_at: user.created_at
        }));
    }

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
    if (externalUsersApi.useCSVMode) {
      return await externalUsersApi.getCompletedUsers();
    }

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

  // Получение анкеты пользователя
  getUserSurvey: async (telegramId: number): Promise<UserSurvey> => {
    if (externalUsersApi.useCSVMode) {
      // Убеждаемся, что CSV данные загружены
      await externalUsersApi.csvManager.loadData();
      const csvUser = externalUsersApi.csvManager.getUserSurvey(telegramId);
      if (!csvUser) {
        throw new Error('Пользователь не найден');
      }

      return {
        telegram_id: csvUser.telegram_id,
        full_name: csvUser.full_name,
        faculty: csvUser.faculty,
        group: csvUser.group,
        phone: csvUser.phone,
        email: undefined,
        birth_date: undefined,
        education_level: undefined,
        experience: undefined,
        skills: csvUser.q2.filter(skill => skill && skill.trim()),
        interests: [csvUser.q3, csvUser.q4, csvUser.q5, csvUser.q6, csvUser.q7, csvUser.q8, csvUser.q9]
          .filter(interest => interest && interest.trim()),
        completed_at: csvUser.created_at,
        survey_data: {
          q1: csvUser.q1,
          q9: csvUser.q9, // Передаем данные рисунка
          completion_time_seconds: csvUser.completion_time_seconds,
          survey_id: csvUser.survey_id,
          username: csvUser.username,
          request_id: csvUser.request_id
        }
      };
    }

    try {
      const response = await externalApi.get<UserSurvey>(`/api/users/${telegramId}/survey`);
      return response.data;
    } catch (error: any) {
      console.error('Error fetching user survey:', error);
      throw new Error(error.response?.data || 'Ошибка при получении анкеты пользователя');
    }
  },

  // Получение всех записей пользователей
  getUserBookings: async (): Promise<BookingRecord[]> => {
    try {
      const response = await api.get<BookingRecord[]>('/bookings');
      return response.data;
    } catch (error: any) {
      console.error('Error fetching user bookings:', error);
      throw new Error(error.response?.data || 'Ошибка при получении записей пользователей');
    }
  },

  // Переключение режима работы
  toggleCSVMode: (useCSV: boolean) => {
    externalUsersApi.useCSVMode = useCSV;
    if (useCSV) {
      externalUsersApi.csvManager.clearCache();
    }
  },

  // Получение статистики CSV данных
  getCSVStats: async () => {
    if (!externalUsersApi.useCSVMode) {
      throw new Error('CSV режим не включен');
    }
    await externalUsersApi.csvManager.loadData();
    return externalUsersApi.csvManager.getStats();
  },

  // Получение структуры активной анкеты
  getActiveSurvey: async (): Promise<SurveyStructure> => {
    if (externalUsersApi.useCSVMode) {
      const csvStructure = await externalUsersApi.csvManager.loadSurveyStructure();
      if (!csvStructure) {
        throw new Error('Структура анкеты не найдена в CSV режиме');
      }
      return csvStructure;
    }

    try {
      const response = await externalApi.get<SurveyStructure>('/api/survey');
      return response.data;
    } catch (error: any) {
      console.error('Error fetching active survey:', error);
      throw new Error(error.response?.data || 'Ошибка при получении структуры анкеты');
    }
  },

  // Получение статистики анкеты
  getSurveyStatistics: async (): Promise<SurveyStatistics> => {
    if (externalUsersApi.useCSVMode) {
      // Убеждаемся, что CSV данные загружены
      const csvData = await externalUsersApi.csvManager.loadData();
      const questionStats = externalUsersApi.csvManager.getQuestionStats();
      
      if (!questionStats) {
        throw new Error('Статистика недоступна в CSV режиме');
      }

      // Вычисляем общую статистику
      const totalResponses = csvData.length;
      const completedResponses = csvData.filter(user => user.telegram_id > 0).length;
      const completionRate = totalResponses > 0 ? completedResponses / totalResponses : 0;
      
      // Среднее время заполнения
      const avgTime = csvData.reduce((sum, user) => sum + user.completion_time_seconds, 0) / totalResponses;

      return {
        total_responses: totalResponses,
        completion_rate: completionRate,
        average_completion_time: avgTime,
        question_stats: questionStats
      };
    }

    try {
      const response = await externalApi.get<SurveyStatistics>('/api/survey/stats');
      return response.data;
    } catch (error: any) {
      console.error('Error fetching survey statistics:', error);
      throw new Error(error.response?.data || 'Ошибка при получении статистики анкеты');
    }
  },

  // Очистка кэша
  clearCache: (): void => {
    if (externalUsersApi.useCSVMode) {
      externalUsersApi.csvManager.clearCache();
    } else {
      localStorage.removeItem('external_users_cache');
    }
  },

  // Проверка доступности внешнего API
  checkHealth: async (): Promise<boolean> => {
    if (externalUsersApi.useCSVMode) {
      try {
        await externalUsersApi.csvManager.loadData();
        return true;
      } catch {
        return false;
      }
    }

    try {
      await externalApi.get('/api/users/completed');
      return true;
    } catch {
      return false;
    }
  }
};
