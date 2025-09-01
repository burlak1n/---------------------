import type { SurveyStructure } from '../types';

export interface JSONSurveyResponse {
  _id: { $oid: string };
  full_name: string;
  faculty: string;
  group: string;
  phone: string;
  q1: string;
  q2: string[];
  q3: string;
  q4: string;
  q5: string;
  q6: string;
  q7: string;
  q8: string;
  q9: string;
  completion_time_seconds: number;
  survey_id: string;
  telegram_id: { $numberLong: string };
  username: string;
  request_id: string;
  created_at: string;
}

export interface ParsedSurveyResponse {
  _id: string;
  full_name: string;
  faculty: string;
  group: string;
  phone: string;
  q1: string;
  q2: string[];
  q3: string;
  q4: string;
  q5: string;
  q6: string;
  q7: string;
  q8: string;
  q9: string;
  completion_time_seconds: number;
  survey_id: string;
  telegram_id: number;
  username: string;
  request_id: string;
  created_at: string;
}

export class JSONDataManager {
  private static instance: JSONDataManager;
  private data: ParsedSurveyResponse[] = [];
  private surveyStructure: SurveyStructure | null = null;
  private isLoaded = false;

  private constructor() {}

  static getInstance(): JSONDataManager {
    if (!JSONDataManager.instance) {
      JSONDataManager.instance = new JSONDataManager();
    }
    return JSONDataManager.instance;
  }

  async loadData(): Promise<ParsedSurveyResponse[]> {
    if (this.isLoaded) {
      console.log('JSON: Данные уже загружены, возвращаем кэш');
      return this.data;
    }

    console.log('JSON: Начинаем загрузку данных...');
    
    try {
      // Загружаем структуру анкеты
      console.log('JSON: Загружаем структуру анкеты...');
      await this.loadSurveyStructure();
      
      // Загружаем JSON данные
      console.log('JSON: Загружаем JSON файл...');
      const response = await fetch('/shaforms.responses.json');
      const jsonData: JSONSurveyResponse[] = await response.json();
      
      console.log('JSON: Обрабатываем результаты парсинга...');
      console.log('JSON: Первый элемент:', jsonData[0]);
      console.log('JSON: Всего элементов:', jsonData.length);
      
      this.data = jsonData.map((row: JSONSurveyResponse, index: number) => {
        const parsedUser = {
          _id: row._id.$oid,
          full_name: row.full_name,
          faculty: row.faculty,
          group: row.group,
          phone: row.phone,
          q1: row.q1,
          q2: row.q2 || [],
          q3: row.q3,
          q4: row.q4,
          q5: row.q5,
          q6: row.q6,
          q7: row.q7,
          q8: row.q8,
          q9: row.q9,
          completion_time_seconds: row.completion_time_seconds || 0,
          survey_id: row.survey_id,
          telegram_id: parseInt(row.telegram_id.$numberLong) || 0,
          username: row.username,
          request_id: row.request_id,
          created_at: row.created_at,
        } as ParsedSurveyResponse;
        
        if (index < 3) {
          console.log(`JSON: Обработан пользователь ${index}:`, {
            telegram_id: parsedUser.telegram_id,
            full_name: parsedUser.full_name,
            raw_telegram_id: row.telegram_id
          });
        }
        
        return parsedUser;
      }).filter(user => user.telegram_id > 0); // Фильтруем только пользователей с telegram_id

      console.log(`JSON: Загружено ${this.data.length} пользователей`);
      this.isLoaded = true;
      return this.data;
    } catch (error) {
      console.error('JSON: Ошибка при загрузке данных:', error);
      throw new Error('Ошибка при загрузке JSON данных');
    }
  }

  async loadSurveyStructure(): Promise<SurveyStructure | null> {
    if (this.surveyStructure) {
      return this.surveyStructure;
    }

    try {
      const response = await fetch('/form.response.json');
      this.surveyStructure = await response.json();
      return this.surveyStructure;
    } catch (error) {
      console.error('Error loading survey structure:', error);
      return null;
    }
  }

  getSurveyStructure(): SurveyStructure | null {
    return this.surveyStructure;
  }

  getCompletedUsers(): ParsedSurveyResponse[] {
    return this.data.filter(user => user.telegram_id > 0);
  }

  getUserSurvey(telegramId: number): ParsedSurveyResponse | null {
    console.log(`JSON: Ищем пользователя с telegram_id: ${telegramId}`);
    console.log(`JSON: Всего пользователей в данных: ${this.data.length}`);
    console.log(`JSON: Доступные telegram_id:`, this.data.map(u => u.telegram_id).slice(0, 10));
    
    const user = this.data.find(user => user.telegram_id === telegramId);
    console.log(`JSON: Найден пользователь:`, user ? 'да' : 'нет');
    
    return user || null;
  }

  getUsersByFaculty(faculty: string): ParsedSurveyResponse[] {
    return this.data.filter(user => 
      user.faculty.toLowerCase().includes(faculty.toLowerCase())
    );
  }

  getUsersByGroup(group: string): ParsedSurveyResponse[] {
    return this.data.filter(user => 
      user.group.toLowerCase().includes(group.toLowerCase())
    );
  }

  getUniqueFaculties(): string[] {
    return Array.from(new Set(this.data.map(user => user.faculty))).sort();
  }

  getUniqueGroups(): string[] {
    return Array.from(new Set(this.data.map(user => user.group))).sort();
  }

  getStats() {
    const totalUsers = this.data.length;
    const uniqueFaculties = this.getUniqueFaculties().length;
    const uniqueGroups = this.getUniqueGroups().length;
    const completedUsers = this.getCompletedUsers().length;

    return {
      totalUsers,
      uniqueFaculties,
      uniqueGroups,
      completedUsers
    };
  }

  getQuestionStats() {
    if (!this.surveyStructure) return null;

    const questionStats: Record<string, any> = {};
    
    this.surveyStructure.config.questions.forEach(question => {
      const responses = this.data.map(user => {
        switch (question.id) {
          case 'q1': return user.q1;
          case 'q2': return user.q2;
          case 'q3': return user.q3;
          case 'q4': return user.q4;
          case 'q5': return user.q5;
          case 'q6': return user.q6;
          case 'q7': return user.q7;
          case 'q8': return user.q8;
          case 'q9': return user.q9;
          default: return null;
        }
      }).filter(response => response && response !== '');

      questionStats[question.id] = {
        response_count: responses.length,
        completion_rate: responses.length / this.data.length,
        responses: responses
      };
    });

    return questionStats;
  }

  clearCache() {
    this.data = [];
    this.surveyStructure = null;
    this.isLoaded = false;
  }
}

export class DebugDataManager {
  private static instance: DebugDataManager;
  private data: ParsedSurveyResponse[] = [];
  private surveyStructure: SurveyStructure | null = null;
  private isLoaded = false;

  private constructor() {}

  static getInstance(): DebugDataManager {
    if (!DebugDataManager.instance) {
      DebugDataManager.instance = new DebugDataManager();
    }
    return DebugDataManager.instance;
  }

  async loadData(): Promise<ParsedSurveyResponse[]> {
    if (this.isLoaded) {
      console.log('DEBUG: Данные уже загружены, возвращаем кэш');
      return this.data;
    }

    console.log('DEBUG: Загружаем тестовые данные...');
    
    try {
      // Загружаем структуру анкеты
      await this.loadSurveyStructure();
      
      // Создаем тестовые данные
      this.data = [
        {
          _id: 'debug_1',
          full_name: 'Тестовый Пользователь 1',
          faculty: 'Тестовый Факультет',
          group: 'Группа А',
          phone: '1234567890',
          q1: 'Тестовый ответ 1',
          q2: ['тест1', 'тест2'],
          q3: 'Тестовый ответ 3',
          q4: 'Тестовый ответ 4',
          q5: 'Тестовый ответ 5',
          q6: 'Тестовый ответ 6',
          q7: 'Тестовый ответ 7',
          q8: 'Тестовый ответ 8',
          q9: 'Тестовый ответ 9',
          completion_time_seconds: 120,
          survey_id: 'debug',
          telegram_id: 123456789,
          username: 'test_user_1',
          request_id: 'debug-request-1',
          created_at: new Date().toISOString(),
        },
        {
          _id: 'debug_2',
          full_name: 'Тестовый Пользователь 2',
          faculty: 'Тестовый Факультет',
          group: 'Группа Б',
          phone: '0987654321',
          q1: 'Тестовый ответ 1-2',
          q2: ['тест3', 'тест4'],
          q3: 'Тестовый ответ 3-2',
          q4: 'Тестовый ответ 4-2',
          q5: 'Тестовый ответ 5-2',
          q6: 'Тестовый ответ 6-2',
          q7: 'Тестовый ответ 7-2',
          q8: 'Тестовый ответ 8-2',
          q9: 'Тестовый ответ 9-2',
          completion_time_seconds: 180,
          survey_id: 'debug',
          telegram_id: 987654321,
          username: 'test_user_2',
          request_id: 'debug-request-2',
          created_at: new Date().toISOString(),
        }
      ];

      console.log(`DEBUG: Загружено ${this.data.length} тестовых пользователей`);
      this.isLoaded = true;
      return this.data;
    } catch (error) {
      console.error('DEBUG: Ошибка при загрузке тестовых данных:', error);
      throw new Error('Ошибка при загрузке тестовых данных');
    }
  }

  async loadSurveyStructure(): Promise<SurveyStructure | null> {
    if (this.surveyStructure) {
      return this.surveyStructure;
    }

    try {
      const response = await fetch('/form.response.json');
      this.surveyStructure = await response.json();
      return this.surveyStructure;
    } catch (error) {
      console.error('Error loading survey structure:', error);
      return null;
    }
  }

  getSurveyStructure(): SurveyStructure | null {
    return this.surveyStructure;
  }

  getCompletedUsers(): ParsedSurveyResponse[] {
    return this.data.filter(user => user.telegram_id > 0);
  }

  getUserSurvey(telegramId: number): ParsedSurveyResponse | null {
    console.log(`DEBUG: Ищем пользователя с telegram_id: ${telegramId}`);
    const user = this.data.find(user => user.telegram_id === telegramId);
    return user || null;
  }

  getUsersByFaculty(faculty: string): ParsedSurveyResponse[] {
    return this.data.filter(user => 
      user.faculty.toLowerCase().includes(faculty.toLowerCase())
    );
  }

  getUsersByGroup(group: string): ParsedSurveyResponse[] {
    return this.data.filter(user => 
      user.group.toLowerCase().includes(group.toLowerCase())
    );
  }

  getUniqueFaculties(): string[] {
    return Array.from(new Set(this.data.map(user => user.faculty))).sort();
  }

  getUniqueGroups(): string[] {
    return Array.from(new Set(this.data.map(user => user.group))).sort();
  }

  getStats() {
    const totalUsers = this.data.length;
    const uniqueFaculties = this.getUniqueFaculties().length;
    const uniqueGroups = this.getUniqueGroups().length;
    const completedUsers = this.getCompletedUsers().length;

    return {
      totalUsers,
      uniqueFaculties,
      uniqueGroups,
      completedUsers
    };
  }

  getQuestionStats() {
    if (!this.surveyStructure) return null;

    const questionStats: Record<string, any> = {};
    
    this.surveyStructure.config.questions.forEach(question => {
      const responses = this.data.map(user => {
        switch (question.id) {
          case 'q1': return user.q1;
          case 'q2': return user.q2;
          case 'q3': return user.q3;
          case 'q4': return user.q4;
          case 'q5': return user.q5;
          case 'q6': return user.q6;
          case 'q7': return user.q7;
          case 'q8': return user.q8;
          case 'q9': return user.q9;
          default: return null;
        }
      }).filter(response => response && response !== '');

      questionStats[question.id] = {
        response_count: responses.length,
        completion_rate: responses.length / this.data.length,
        responses: responses
      };
    });

    return questionStats;
  }

  clearCache() {
    this.data = [];
    this.surveyStructure = null;
    this.isLoaded = false;
  }
}
