import axios from 'axios';
import type {
  Slot,
  User,
  Booking,
  BookingRecord,
  CreateSlotRequest,
  CreateUserRequest,
  CreateBookingRequest,
  UpdateSlotRequest,
  UpdateUserRequest,
  NoResponseUser,
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
  // Voting system types
  Vote,
  CreateVoteRequest,
  NextSurveyResponse,
  VoteResponse,
} from './types';
import { JSONDataManager, DebugDataManager } from './utils/jsonUtils';

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Отдельный instance для внешнего API
// Автоматическое определение URL на основе хоста
const getExternalApiUrl = () => {
  const hostname = window.location.hostname;
  
  // Локальная разработка
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return 'http://localhost:3001';
  }
  
  // Продакшен - используем тот же домен
  if (hostname === 'admin.ingroupsts.ru') {
    return 'https://admin.ingroupsts.ru';
  }
  
  // Fallback для других случаев
  return 'http://localhost:3001';
};

const externalApiUrl = getExternalApiUrl();
console.log('🔗 External API URL:', externalApiUrl);

const externalApi = axios.create({
  baseURL: externalApiUrl,
  headers: {
    'Content-Type': 'application/json',
    'X-Forwarded-For': '127.0.0.1', // Требуется для локального API
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
  getAll: async (): Promise<number[]> => {
    const response = await api.get<number[]>('/user_roles');
    return response.data;
  },
  create: async (user: CreateUserRequest): Promise<User> => {
    const response = await api.post<User>('/user_roles', user);
    return response.data;
  },
  update: async (telegramId: number, user: UpdateUserRequest): Promise<User> => {
    const response = await api.put<User>(`/user_roles/${telegramId}`, user);
    return response.data;
  },
  delete: async (telegramId: number): Promise<void> => {
    await api.delete(`/user_roles/${telegramId}`);
  },
};

// Bookings API
export const bookingsApi = {
  getAll: async (): Promise<BookingRecord[]> => {
    const response = await api.get<BookingRecord[]>('/bookings');
    return response.data;
  },
  create: async (booking: CreateBookingRequest): Promise<Booking> => {
    const response = await api.post<Booking>('/bookings', booking);
    return response.data;
  },
  delete: async (id: number): Promise<void> => {
    await api.delete(`/bookings/${id}`);
  },
  // Получение пользователей записанных на конкретный слот
  getUsersBySlot: async (slotId: number): Promise<BookingRecord[]> => {
    const response = await api.get<BookingRecord[]>(`/bookings/slot/${slotId}`);
    return response.data;
  },
  // Получение всех записей сгруппированных по слотам
  getBookingsBySlots: async (): Promise<{[slotId: number]: BookingRecord[]}> => {
    const response = await api.get<{[slotId: number]: BookingRecord[]}>('/bookings/by-slots');
    return response.data;
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
  // Флаг для переключения между внешним API и локальным режимом
  useLocalMode: false,
  // Режим локальных данных: 'json' или 'debug'
  localMode: 'json' as 'json' | 'debug',
  
  // Менеджеры для работы с локальными данными
  jsonManager: JSONDataManager.getInstance(),
  debugManager: DebugDataManager.getInstance(),

  // Вспомогательная функция для получения активного менеджера
  getActiveManager() {
    if (externalUsersApi.localMode === 'debug') {
      return externalUsersApi.debugManager;
    }
    return externalUsersApi.jsonManager;
  },

  // Получение пользователей с завершенными анкетами
  getCompletedUsers: async (): Promise<ExternalUser[]> => {
    if (externalUsersApi.useLocalMode) {
      console.log('API: getCompletedUsers в локальном режиме');
      const localData = await externalUsersApi.getActiveManager().loadData();
      console.log('API: localData первые 2 элемента:', localData.slice(0, 2));
      
      const result = localData
        .filter(user => user.telegram_id > 0)
        .map(user => ({
          telegram_id: user.telegram_id,
          username: user.username,
          full_name: user.full_name,
          faculty: user.faculty,
          group: user.group,
          phone: user.phone,
          completed_at: user.created_at
        }));
      
      console.log('API: результат маппинга первые 2 элемента:', result.slice(0, 2));
      return result;
    }

    try {
      // Используем внутренний API админ-панели вместо прямого обращения к внешнему API
      const response = await api.get<ExternalUser[]>('/external-users');
      const users = response.data;
      
      console.log(`✅ Получено ${users.length} пользователей через админ API`);
      return users;
    } catch (error: any) {
      console.error('Error fetching external users:', error);
      throw new Error(error.response?.data || 'Ошибка при получении пользователей из внешнего API');
    }
  },

  // Получение отобранных пользователей (одобренных ответственными)
  getSelectedUsers: async (): Promise<ExternalUser[]> => {
    try {
      const response = await api.get<ExternalUser[]>('/selected-users');
      const users = response.data;
      
      console.log(`✅ Получено ${users.length} отобранных пользователей`);
      return users;
    } catch (error: any) {
      console.error('Error fetching selected users:', error);
      throw new Error(error.response?.data || 'Ошибка при получении отобранных пользователей');
    }
  },

  // Получение пользователей без записи после рассылки о записи
  getNoResponseUsers: async (): Promise<NoResponseUser[]> => {
    try {
      const response = await api.get<NoResponseUser[]>('/no-response-users');
      const users = response.data;
      
      console.log(`✅ Получено ${users.length} пользователей без записи`);
      return users;
    } catch (error: any) {
      console.error('Error fetching no response users:', error);
      throw new Error(error.response?.data || 'Ошибка при получении пользователей без записи');
    }
  },

  // Обновление статуса сообщения рассылки
  updateMessageStatus: async (telegramId: number, messageType: string, status: string): Promise<void> => {
    try {
      await api.put('/broadcast-message-status', {
        telegram_id: telegramId,
        message_type: messageType,
        status: status
      });
      
      console.log(`✅ Статус сообщения обновлен для пользователя ${telegramId}`);
    } catch (error: any) {
      console.error('Error updating message status:', error);
      throw new Error(error.response?.data || 'Ошибка при обновлении статуса сообщения');
    }
  },

  // Получение пользователей с кэшированием
  getCompletedUsersCached: async (): Promise<ExternalUser[]> => {
    if (externalUsersApi.useLocalMode) {
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
    if (externalUsersApi.useLocalMode) {
      // Убеждаемся, что локальные данные загружены
      await externalUsersApi.getActiveManager().loadData();
      const localUser = externalUsersApi.getActiveManager().getUserSurvey(telegramId);
      if (!localUser) {
        throw new Error('Пользователь не найден');
      }

      return {
        telegram_id: localUser.telegram_id,
        username: localUser.username,
        full_name: localUser.full_name,
        faculty: localUser.faculty,
        group: localUser.group,
        phone: localUser.phone,
        email: undefined,
        birth_date: undefined,
        education_level: undefined,
        experience: undefined,
        skills: localUser.q2.filter(skill => skill && skill.trim()),
        // Не фильтруем, чтобы сохранить позиции (q3..q9)
        interests: [localUser.q3, localUser.q4, localUser.q5, localUser.q6, localUser.q7, localUser.q8, localUser.q9],
        completed_at: localUser.created_at,
        // Добавляем прямые поля для вопросов
        q5: localUser.q5,
        q6: localUser.q6,
        q7: localUser.q7,
        q8: localUser.q8,
        q9: localUser.q9,
        survey_data: {
          q1: localUser.q1,
          q9: localUser.q9, // Передаем данные рисунка
          completion_time_seconds: localUser.completion_time_seconds,
          survey_id: localUser.survey_id,
          username: localUser.username,
          request_id: localUser.request_id
        }
      };
    }

    try {
      const response = await api.get<UserSurvey>(`/users/${telegramId}/survey`);
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
  toggleLocalMode: (useLocal: boolean, mode: 'json' | 'debug' = 'json') => {
    externalUsersApi.useLocalMode = useLocal;
    externalUsersApi.localMode = mode;
    if (useLocal) {
      if (mode === 'json') {
        externalUsersApi.getActiveManager().clearCache();
      } else {
        externalUsersApi.debugManager.clearCache();
      }
    }
  },

  // Получение статистики локальных данных
  getLocalStats: async () => {
    if (!externalUsersApi.useLocalMode) {
      throw new Error('Локальный режим не включен');
    }
    await externalUsersApi.getActiveManager().loadData();
    return externalUsersApi.getActiveManager().getStats();
  },

  // Получение структуры активной анкеты
  getActiveSurvey: async (): Promise<SurveyStructure> => {
    if (externalUsersApi.useLocalMode) {
      const localStructure = await externalUsersApi.getActiveManager().loadSurveyStructure();
      if (!localStructure) {
        throw new Error('Структура анкеты не найдена в локальный режиме');
      }
      return localStructure;
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
    if (externalUsersApi.useLocalMode) {
      // Убеждаемся, что локальные данные загружены
      const localData = await externalUsersApi.getActiveManager().loadData();
      const localQuestionStats = externalUsersApi.getActiveManager().getQuestionStats();
      
      if (!localQuestionStats) {
        throw new Error('Статистика недоступна в локальный режиме');
      }

      // Вычисляем общую статистику
      const totalResponses = localData.length;
      const completedResponses = localData.filter(user => user.telegram_id > 0).length;
      const completionRate = totalResponses > 0 ? completedResponses / totalResponses : 0;
      
      // Среднее время заполнения
      const avgTime = localData.reduce((sum, user) => sum + user.completion_time_seconds, 0) / totalResponses;

      return {
        total_responses: totalResponses,
        completion_rate: completionRate,
        average_completion_time: avgTime,
        question_stats: localQuestionStats
      };
    }

    try {
      const response = await externalApi.get<SurveyStatistics>('/survey/stats');
      return response.data;
    } catch (error: any) {
      console.error('Error fetching survey statistics:', error);
      throw new Error(error.response?.data || 'Ошибка при получении статистики анкеты');
    }
  },

  // Очистка кэша
  clearCache: (): void => {
    if (externalUsersApi.useLocalMode) {
      externalUsersApi.getActiveManager().clearCache();
    } else {
      localStorage.removeItem('external_users_cache');
    }
  },

  // Проверка доступности внешнего API
  checkHealth: async (): Promise<boolean> => {
    if (externalUsersApi.useLocalMode) {
      try {
        await externalUsersApi.getActiveManager().loadData();
        return true;
      } catch {
        return false;
      }
    }

    try {
      await externalApi.get('/external-users');
      return true;
    } catch {
      return false;
    }
  }
};

// Votes API
export const votesApi = {
  getAll: async (): Promise<Vote[]> => {
    const response = await api.get<Vote[]>('/votes');
    return response.data;
  },

  getResponsibleUsers: async (): Promise<number[]> => {
    const response = await api.get<number[]>('/user_roles');
    return response.data;
  },
  
  getBySurveyId: async (surveyId: number): Promise<Vote[]> => {
    const response = await api.get<Vote[]>(`/votes/survey/${surveyId}`);
    return response.data;
  },
  
  create: async (vote: CreateVoteRequest, voterTelegramId: number): Promise<Vote> => {
    const response = await api.post<Vote>(`/votes?telegram_id=${voterTelegramId}`, vote);
    return response.data;
  },
  
  update: async (id: number, vote: Partial<CreateVoteRequest>): Promise<Vote> => {
    const response = await api.put<Vote>(`/votes/${id}`, vote);
    return response.data;
  },
  
  delete: async (id: number): Promise<void> => {
    await api.delete(`/votes/${id}`);
  },
  
  
  getNextSurvey: async (telegramId: number): Promise<NextSurveyResponse> => {
    const response = await api.get<NextSurveyResponse>(`/surveys/next?telegram_id=${telegramId}`);
    return response.data;
  },
  
  submitVote: async (surveyId: number, vote: CreateVoteRequest, telegramId: number): Promise<VoteResponse> => {
    const response = await api.post<VoteResponse>(`/surveys/${surveyId}/vote?telegram_id=${telegramId}`, vote);
    return response.data;
  },
  
  clearLocks: async (telegramId: number): Promise<number> => {
    const response = await api.post<number>(`/votes/clear-locks/${telegramId}`);
    return response.data;
  }
};
