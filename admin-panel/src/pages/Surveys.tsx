import React, { useState, useEffect } from 'react';
import { Heart, HeartOff, Eye, Search, Filter, LayoutList, Layers } from 'lucide-react';
import { externalUsersApi } from '../api';
import type { UserSurvey } from '../types';
import SurveyDisplay from '../components/SurveyDisplay';
import SurveyCardStack from '../components/SurveyCardStack';

interface SurveyWithRating extends UserSurvey {
  isLiked?: boolean;
  isDisliked?: boolean;
  comment?: string;
}

const Surveys: React.FC = () => {
  const [surveys, setSurveys] = useState<SurveyWithRating[]>([]);
  const [filteredSurveys, setFilteredSurveys] = useState<SurveyWithRating[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedSurvey, setSelectedSurvey] = useState<SurveyWithRating | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'liked' | 'disliked' | 'unrated'>('all');
  const [viewMode, setViewMode] = useState<'stack' | 'list'>('stack');

  useEffect(() => {
    loadSurveys();
  }, []);

  useEffect(() => {
    filterSurveys();
  }, [surveys, searchTerm, filterStatus]);

  const loadSurveys = async () => {
    setLoading(true);
    setError(null);
    try {
      const completedUsers = await externalUsersApi.getCompletedUsers();
      console.log('Loaded users:', completedUsers.length);
      
      // Получаем полные данные анкет для каждого пользователя
      const surveysPromises = completedUsers.map(async (user) => {
        try {
          const fullSurvey = await externalUsersApi.getUserSurvey(user.telegram_id);
          return {
            ...fullSurvey,
            isLiked: false,
            isDisliked: false
          };
        } catch (error) {
          console.error(`Error loading survey for user ${user.telegram_id}:`, error);
          // Возвращаем базовые данные, если не удалось загрузить анкету
          return {
            ...user,
            isLiked: false,
            isDisliked: false,
            survey_data: undefined,
            skills: [],
            interests: [],
            q5: '',
            q6: '',
            q7: '',
            q8: '',
            q9: ''
          };
        }
      });

      const surveysWithRating = await Promise.all(surveysPromises);
      console.log('Surveys with rating:', surveysWithRating.length);
      console.log('First survey data:', surveysWithRating[0]);
      setSurveys(surveysWithRating);
    } catch (err: any) {
      setError(err.message);
      console.error('Error loading surveys:', err);
    } finally {
      setLoading(false);
    }
  };

  const filterSurveys = () => {
    let filtered = surveys;

    // Фильтр по статусу
    switch (filterStatus) {
      case 'liked':
        filtered = filtered.filter(survey => survey.isLiked);
        break;
      case 'disliked':
        filtered = filtered.filter(survey => survey.isDisliked);
        break;
      case 'unrated':
        filtered = filtered.filter(survey => !survey.isLiked && !survey.isDisliked);
        break;
      default:
        break;
    }

    // Поиск по тексту
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(survey => 
        survey.full_name.toLowerCase().includes(term) ||
        survey.faculty.toLowerCase().includes(term) ||
        survey.group.toLowerCase().includes(term) ||
        (survey.survey_data?.q1 && survey.survey_data.q1.toLowerCase().includes(term)) ||
        (survey.q5 && survey.q5.toLowerCase().includes(term)) ||
        (survey.q6 && survey.q6.toLowerCase().includes(term)) ||
        (survey.q7 && survey.q7.toLowerCase().includes(term)) ||
        (survey.q8 && survey.q8.toLowerCase().includes(term))
      );
    }

    setFilteredSurveys(filtered);
  };

  const handleRating = (surveyId: number, isLiked: boolean, comment?: string) => {
    setSurveys(prev => prev.map(survey => {
      if (survey.telegram_id === surveyId) {
        return {
          ...survey,
          isLiked: isLiked,
          isDisliked: !isLiked,
          comment: comment || ''
        };
      }
      return survey;
    }));
  };

  const handleSkip = (surveyId: number, comment?: string) => {
    // Пропускаем анкету без оценки, но сохраняем комментарий
    setSurveys(prev => prev.map(survey => {
      if (survey.telegram_id === surveyId) {
        return {
          ...survey,
          comment: comment || ''
        };
      }
      return survey;
    }));
    console.log(`Пропущена анкета: ${surveyId}${comment ? ` с комментарием: ${comment}` : ''}`);
  };

  const openSurvey = (survey: SurveyWithRating) => {
    setSelectedSurvey(survey);
  };

  const closeSurvey = () => {
    setSelectedSurvey(null);
  };

  const getRatingStats = () => {
    const total = surveys.length;
    const liked = surveys.filter(s => s.isLiked).length;
    const disliked = surveys.filter(s => s.isDisliked).length;
    const unrated = total - liked - disliked;
    
    return { total, liked, disliked, unrated };
  };

  const stats = getRatingStats();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Анкеты пользователей</h1>
        <div className="flex items-center gap-4">
          <div className="text-sm text-gray-600">
            Всего: {stats.total} | Понравилось: {stats.liked} | Не понравилось: {stats.disliked} | Не оценено: {stats.unrated}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setViewMode('stack')}
              className={`p-2 rounded-md transition-colors ${
                viewMode === 'stack'
                  ? 'bg-blue-100 text-blue-700'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
              title="Режим стопки"
            >
              <Layers className="h-5 w-5" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 rounded-md transition-colors ${
                viewMode === 'list'
                  ? 'bg-blue-100 text-blue-700'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
              title="Режим списка"
            >
              <LayoutList className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Фильтры и поиск - только в режиме списка */}
      {viewMode === 'list' && (
        <div className="bg-white p-4 rounded-lg shadow-sm border">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                <input
                  type="text"
                  placeholder="Поиск по имени, факультету, ответам..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as any)}
                className="px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="all">Все анкеты</option>
                <option value="liked">Понравились</option>
                <option value="disliked">Не понравились</option>
                <option value="unrated">Не оценены</option>
              </select>
              <button
                onClick={loadSurveys}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
              >
                Обновить
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Загрузка и ошибки */}
      {loading && (
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-2 text-gray-600">Загрузка анкет...</p>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <p className="text-red-700">{error}</p>
        </div>
      )}

      {/* Контент */}
      {!loading && !error && (
        <>
          {viewMode === 'stack' ? (
            <SurveyCardStack 
              surveys={surveys} 
              onRate={handleRating}
              onSkip={handleSkip}
            />
          ) : (
            <div className="grid gap-4">
              {filteredSurveys.map((survey) => (
                <div key={survey.telegram_id} className="bg-white p-4 rounded-lg shadow-sm border hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-lg font-semibold text-gray-900">{survey.full_name}</h3>
                        <span className="text-sm text-gray-500">ID: {survey.telegram_id}</span>
                      </div>
                      <div className="text-sm text-gray-600 mb-3">
                        <span className="font-medium">{survey.faculty}</span> • {survey.group}
                      </div>
                      <div className="text-sm text-gray-700 line-clamp-2">
                        {survey.survey_data?.q1 && (
                          <span className="mr-3">
                            <span className="font-medium">Мем:</span> {survey.survey_data.q1}
                          </span>
                        )}
                        {survey.q5 && (
                          <span className="mr-3">
                            <span className="font-medium">Качество:</span> {survey.q5.substring(0, 100)}...
                          </span>
                        )}
                      </div>
                      {survey.comment && (
                        <div className="text-sm text-blue-700 mt-2 p-2 bg-blue-50 rounded border-l-4 border-blue-300">
                          <span className="font-medium">Комментарий:</span> {survey.comment}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      <button
                        onClick={() => openSurvey(survey)}
                        className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                        title="Просмотреть анкету"
                      >
                        <Eye className="h-5 w-5" />
                      </button>
                      <button
                        onClick={() => handleRating(survey.telegram_id, true, '')}
                        className={`p-2 rounded-md transition-colors ${
                          survey.isLiked
                            ? 'text-red-600 bg-red-50'
                            : 'text-gray-400 hover:text-red-600 hover:bg-red-50'
                        }`}
                        title="Понравилось"
                      >
                        <Heart className="h-5 w-5" />
                      </button>
                      <button
                        onClick={() => handleRating(survey.telegram_id, false, '')}
                        className={`p-2 rounded-md transition-colors ${
                          survey.isDisliked
                            ? 'text-gray-600 bg-gray-50'
                            : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'
                        }`}
                        title="Не понравилось"
                      >
                        <HeartOff className="h-5 w-5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              
              {filteredSurveys.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  {searchTerm || filterStatus !== 'all' 
                    ? 'Анкеты не найдены по заданным критериям'
                    : 'Анкеты не найдены'
                  }
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Модальное окно просмотра анкеты */}
      {selectedSurvey && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900">
                Анкета {selectedSurvey.full_name}
              </h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleRating(selectedSurvey.telegram_id, true, '')}
                  className={`p-2 rounded-md transition-colors ${
                    selectedSurvey.isLiked
                      ? 'text-red-600 bg-red-50'
                      : 'text-gray-400 hover:text-red-600 hover:bg-red-50'
                  }`}
                  title="Понравилось"
                >
                  <Heart className="h-5 w-5" />
                </button>
                <button
                  onClick={() => handleRating(selectedSurvey.telegram_id, false, '')}
                  className={`p-2 rounded-md transition-colors ${
                    selectedSurvey.isDisliked
                      ? 'text-gray-600 bg-gray-50'
                      : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'
                  }`}
                  title="Не понравилось"
                >
                  <HeartOff className="h-5 w-5" />
                </button>
                <button
                  onClick={closeSurvey}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  ✕
                </button>
              </div>
            </div>
            <div className="p-6">
              <SurveyDisplay survey={selectedSurvey} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Surveys;
