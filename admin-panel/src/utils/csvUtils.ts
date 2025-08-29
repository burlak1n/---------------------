import Papa from 'papaparse';
import type { SurveyStructure } from '../types';

export interface CSVSurveyResponse {
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

export class CSVDataManager {
  private static instance: CSVDataManager;
  private data: ParsedSurveyResponse[] = [];
  private surveyStructure: SurveyStructure | null = null;
  private isLoaded = false;

  private constructor() {}

  static getInstance(): CSVDataManager {
    if (!CSVDataManager.instance) {
      CSVDataManager.instance = new CSVDataManager();
    }
    return CSVDataManager.instance;
  }

  async loadData(): Promise<ParsedSurveyResponse[]> {
    if (this.isLoaded) {
      console.log('CSV: Данные уже загружены, возвращаем кэш');
      return this.data;
    }

    console.log('CSV: Начинаем загрузку данных...');
    
    try {
      // Загружаем структуру анкеты
      console.log('CSV: Загружаем структуру анкеты...');
      await this.loadSurveyStructure();
      
      // Загружаем CSV данные
      console.log('CSV: Загружаем CSV файл...');
      const response = await fetch('/shaforms.responses.csv');
      const csvText = await response.text();
      
      console.log('CSV: Парсим CSV данные...');
      const result = Papa.parse(csvText, {
        header: true,
        skipEmptyLines: true,
        transform: (value, field) => {
          // Обработка массива q2
          if (typeof field === 'string' && field.startsWith('q2[')) {
            return value;
          }
          // Обработка числовых полей
          if (field === 'completion_time_seconds' || field === 'telegram_id') {
            return parseInt(value) || 0;
          }
          return value;
        }
      });

      console.log('CSV: Обрабатываем результаты парсинга...');
      this.data = result.data.map((row: any) => {
        // Собираем массив q2
        const q2: string[] = [];
        for (let i = 0; i < 7; i++) {
          const q2Value = row[`q2[${i}]`];
          if (q2Value && q2Value.trim()) {
            q2.push(q2Value.trim());
          }
        }

        return {
          ...row,
          q2,
          completion_time_seconds: parseInt(row.completion_time_seconds) || 0,
          telegram_id: parseInt(row.telegram_id) || 0,
        } as ParsedSurveyResponse;
      }).filter(user => user.telegram_id > 0); // Фильтруем только пользователей с telegram_id

      console.log(`CSV: Загружено ${this.data.length} пользователей`);
      this.isLoaded = true;
      return this.data;
    } catch (error) {
      console.error('CSV: Ошибка при загрузке данных:', error);
      throw new Error('Ошибка при загрузке CSV данных');
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
    console.log(`CSV: Ищем пользователя с telegram_id: ${telegramId}`);
    console.log(`CSV: Всего пользователей в данных: ${this.data.length}`);
    console.log(`CSV: Доступные telegram_id:`, this.data.map(u => u.telegram_id).slice(0, 10));
    
    const user = this.data.find(user => user.telegram_id === telegramId);
    console.log(`CSV: Найден пользователь:`, user ? 'да' : 'нет');
    
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

  // Получение статистики по вопросам
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
