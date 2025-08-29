import React, { useState, useEffect } from 'react';
import { FileText, BarChart3, Clock, Users, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { externalUsersApi } from '../api';
import type { SurveyStructure, SurveyStatistics } from '../types';

interface SurveyOverviewProps {
  isOpen: boolean;
  onClose: () => void;
}

const SurveyOverview: React.FC<SurveyOverviewProps> = ({ isOpen, onClose }) => {
  const [survey, setSurvey] = useState<SurveyStructure | null>(null);
  const [statistics, setStatistics] = useState<SurveyStatistics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadSurveyData();
    }
  }, [isOpen]);

  const loadSurveyData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [surveyData, statsData] = await Promise.all([
        externalUsersApi.getActiveSurvey(),
        externalUsersApi.getSurveyStatistics().catch(() => null) // Статистика может быть недоступна
      ]);
      
      setSurvey(surveyData);
      setStatistics(statsData);
    } catch (err: any) {
      setError(err.message);
      console.error('Error loading survey data:', err);
    } finally {
      setLoading(false);
    }
  };

  const getQuestionTypeIcon = (type: string) => {
    switch (type) {
      case 'Text': return '📝';
      case 'Choice': return '☑️';
      case 'Creative': return '🎨';
      default: return '❓';
    }
  };

  const getQuestionTypeLabel = (type: string) => {
    switch (type) {
      case 'Text': return 'Текст';
      case 'Choice': return 'Выбор';
      case 'Creative': return 'Творческое задание';
      default: return 'Неизвестно';
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            <FileText className="w-6 h-6 text-blue-600" />
            <h2 className="text-xl font-semibold text-gray-900">Обзор анкеты</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {loading && (
            <div className="text-center py-8">
              <Loader2 className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4" />
              <p className="text-gray-600">Загрузка данных анкеты...</p>
            </div>
          )}

          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-md">
              <div className="flex items-center">
                <AlertCircle className="h-5 w-5 text-red-500 mr-2" />
                <span className="text-red-700">{error}</span>
              </div>
            </div>
          )}

          {survey && (
            <div className="space-y-6">
              {/* Основная информация об анкете */}
              <div className="bg-blue-50 p-4 rounded-lg">
                <h3 className="text-lg font-medium text-blue-900 mb-3 flex items-center">
                  <FileText className="w-5 h-5 mr-2" />
                  Информация об анкете
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-blue-700">Название</label>
                    <p className="mt-1 text-sm text-blue-900 font-medium">{survey.title}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-blue-700">Версия</label>
                    <p className="mt-1 text-sm text-blue-900 font-medium">{survey.version}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-blue-700">Статус</label>
                    <div className="mt-1 flex items-center">
                      {survey.is_active ? (
                        <CheckCircle className="h-4 w-4 text-green-500 mr-2" />
                      ) : (
                        <AlertCircle className="h-4 w-4 text-red-500 mr-2" />
                      )}
                      <span className="text-sm text-blue-900">
                        {survey.is_active ? 'Активна' : 'Неактивна'}
                      </span>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-blue-700">Таймер</label>
                    <p className="mt-1 text-sm text-blue-900">
                      {Math.round(survey.config.timer_seconds / 60)} минут
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-blue-700">Создана</label>
                    <p className="mt-1 text-sm text-blue-900">
                      {new Date(survey.created_at).toLocaleDateString('ru-RU')}
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-blue-700">Вопросов</label>
                    <p className="mt-1 text-sm text-blue-900 font-medium">
                      {survey.config.questions.length}
                    </p>
                  </div>
                </div>
              </div>

              {/* Персональная информация */}
              <div className="bg-yellow-50 p-4 rounded-lg">
                <h3 className="text-lg font-medium text-yellow-900 mb-3 flex items-center">
                  <Users className="w-5 h-5 mr-2" />
                  Персональная информация
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {survey.config.personal_info.map((field, index) => (
                    <div key={field.key}>
                      <label className="block text-sm font-medium text-yellow-700">
                        {field.label}
                        {field.required && <span className="text-red-500 ml-1">*</span>}
                      </label>
                      <div className="mt-1 flex items-center space-x-2">
                        <span className="text-sm text-yellow-900 font-medium">
                          {field.field_type === 'text' ? '📝 Текст' : '📱 Телефон'}
                        </span>
                        {field.validation && (
                          <div className="text-xs text-yellow-600">
                            {field.validation.min_length && `мин: ${field.validation.min_length}`}
                            {field.validation.max_length && ` макс: ${field.validation.max_length}`}
                            {field.validation.pattern && ` паттерн: ${field.validation.pattern}`}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Статистика */}
              {statistics && (
                <div className="bg-green-50 p-4 rounded-lg">
                  <h3 className="text-lg font-medium text-green-900 mb-3 flex items-center">
                    <BarChart3 className="w-5 h-5 mr-2" />
                    Статистика анкеты
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-green-600">{statistics.total_responses}</div>
                      <div className="text-sm text-green-700">Всего ответов</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-green-600">
                        {Math.round(statistics.completion_rate * 100)}%
                      </div>
                      <div className="text-sm text-green-700">Процент завершения</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-green-600">
                        {Math.round(statistics.average_completion_time / 60)} мин
                      </div>
                      <div className="text-sm text-green-700">Среднее время</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Вопросы анкеты */}
              <div className="bg-gray-50 p-4 rounded-lg">
                <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
                  <FileText className="w-5 h-5 mr-2" />
                  Вопросы анкеты ({survey.config.questions.length})
                </h3>
                <div className="space-y-4">
                  {survey.config.questions.map((question, index) => (
                    <div key={question.id} className="bg-white p-4 rounded-lg border border-gray-200">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center space-x-2 mb-2">
                            <span className="text-sm font-medium text-gray-500">#{question.number}</span>
                            <span className="text-lg">{getQuestionTypeIcon(question.type)}</span>
                            <span className="text-sm text-gray-600">
                              {getQuestionTypeLabel(question.type)}
                            </span>
                            {question.required && (
                              <span className="text-xs bg-red-100 text-red-800 px-2 py-1 rounded-full">
                                Обязательный
                              </span>
                            )}
                            {question.type === 'Choice' && question.multiple && (
                              <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full">
                                Множественный выбор
                              </span>
                            )}
                            {question.type === 'Choice' && question.allow_custom && (
                              <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full">
                                Свой вариант
                              </span>
                            )}
                          </div>
                          <h4 className="text-base font-medium text-gray-900 mb-2">
                            {question.text}
                          </h4>
                          {question.options && question.options.length > 0 && (
                            <div className="space-y-1">
                              <span className="text-xs font-medium text-gray-500">Варианты ответов:</span>
                              <div className="flex flex-wrap gap-2">
                                {question.options.map((option, optIndex) => (
                                  <span
                                    key={optIndex}
                                    className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
                                  >
                                    {option}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                          {question.type === 'Creative' && question.formats && (
                            <div className="space-y-1">
                              <span className="text-xs font-medium text-gray-500">Допустимые форматы:</span>
                              <div className="flex flex-wrap gap-2">
                                {question.formats.map((format, formatIndex) => (
                                  <span
                                    key={formatIndex}
                                    className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800"
                                  >
                                    {format === 'text' ? 'Текст' : format === 'drawing' ? 'Рисование' : format}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                        
                        {/* Статистика по вопросу */}
                        {statistics?.question_stats[question.id] && (
                          <div className="text-right text-sm text-gray-600">
                            <div className="font-medium">
                              {statistics.question_stats[question.id].response_count} ответов
                            </div>
                            <div>
                              {Math.round(statistics.question_stats[question.id].completion_rate * 100)}% завершения
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end p-6 border-t border-gray-200">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors"
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
};

export default SurveyOverview;
