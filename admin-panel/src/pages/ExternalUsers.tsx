import React, { useEffect, useState } from 'react';
import { Users, RefreshCw, AlertCircle, CheckCircle, Clock, Download, Filter, Eye, Calendar, FileText } from 'lucide-react';
import { externalUsersApi } from '../api';
import type { ExternalUser, BookingRecord } from '../types';
import UserProfile from '../components/UserProfile';
import SurveyOverview from '../components/SurveyOverview';

const ExternalUsers: React.FC = () => {
  const [users, setUsers] = useState<ExternalUser[]>([]);
  const [bookings, setBookings] = useState<BookingRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [apiHealth, setApiHealth] = useState<boolean | null>(null);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [useCache, setUseCache] = useState(true);
  const [filterSurvey, setFilterSurvey] = useState<string>('');
  const [filterBooking, setFilterBooking] = useState<string>('all');
  const [useCSVMode, setUseCSVMode] = useState(false);
  
  // Состояние для профиля пользователя
  const [selectedUserProfile, setSelectedUserProfile] = useState<number | null>(null);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  
  // Состояние для обзора анкеты
  const [isSurveyOverviewOpen, setIsSurveyOverviewOpen] = useState(false);
  
  // Состояние для краткой статистики анкеты
  const [surveyStats, setSurveyStats] = useState<any>(null);

  useEffect(() => {
    checkApiHealth();
    fetchUsers();
    fetchBookings();
    // Загружаем статистику анкеты в любом режиме
    loadSurveyStats();
  }, [useCSVMode]);

  const loadSurveyStats = async () => {
    try {
      const stats = await externalUsersApi.getSurveyStatistics();
      setSurveyStats(stats);
    } catch (err) {
      console.error('Error loading survey stats:', err);
      setSurveyStats(null);
    }
  };

  const checkApiHealth = async () => {
    const isHealthy = await externalUsersApi.checkHealth();
    setApiHealth(isHealthy);
  };

  const handleToggleCSVMode = (useCSV: boolean) => {
    console.log(`Переключаем CSV режим на: ${useCSV}`);
    setUseCSVMode(useCSV);
    externalUsersApi.toggleCSVMode(useCSV);
    // Очищаем данные при переключении режима
    setUsers([]);
    setError(null);
    setLastSync(null);
    setSurveyStats(null);
    // Загружаем данные в новом режиме
    setTimeout(() => {
      console.log('Загружаем данные в новом режиме...');
      checkApiHealth();
      fetchUsers();
      fetchBookings();
      loadSurveyStats();
    }, 100);
  };

  const fetchUsers = async () => {
    try {
      console.log(`fetchUsers: начало загрузки, CSV режим: ${useCSVMode}`);
      setLoading(true);
      setError(null);
      
      let data;
      if (useCSVMode) {
        console.log('fetchUsers: загружаем данные в CSV режиме');
        data = await externalUsersApi.getCompletedUsers();
      } else {
        console.log('fetchUsers: загружаем данные в API режиме');
        data = useCache 
          ? await externalUsersApi.getCompletedUsersCached()
          : await externalUsersApi.getCompletedUsers();
      }
      
      console.log(`fetchUsers: получено ${data.length} пользователей`);
      setUsers(data);
      setLastSync(new Date().toISOString());
    } catch (err: any) {
      console.error('fetchUsers: ошибка:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchBookings = async () => {
    try {
      const data = await externalUsersApi.getUserBookings();
      setBookings(data);
    } catch (err: any) {
      console.error('Error fetching bookings:', err);
    }
  };

  const handleRefresh = async () => {
    externalUsersApi.clearCache();
    await Promise.all([fetchUsers(), fetchBookings()]);
  };

  // Проверяем, есть ли запись у пользователя
  const hasBooking = (telegramId: number): boolean => {
    return bookings.some(booking => booking.telegram_id === telegramId);
  };

  const handleExportCSV = () => {
    const csvContent = [
      'Telegram ID,Full Name,Faculty,Group,Phone,Completed At',
      ...users.map(user => 
        `${user.telegram_id},"${user.full_name}","${user.faculty}","${user.group}","${user.phone}","${user.completed_at}"`
      )
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `external_users_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleViewProfile = (telegramId: number) => {
    setSelectedUserProfile(telegramId);
    setIsProfileOpen(true);
  };

  const handleCloseProfile = () => {
    setIsProfileOpen(false);
    setSelectedUserProfile(null);
  };

  const filteredUsers = users.filter(user => {
    const matchesSurvey = !filterSurvey || 
      user.faculty.toLowerCase().includes(filterSurvey.toLowerCase()) || 
      user.group.toLowerCase().includes(filterSurvey.toLowerCase());
    
    const matchesBooking = filterBooking === 'all' || 
      (filterBooking === 'booked' && hasBooking(user.telegram_id)) ||
      (filterBooking === 'not_booked' && !hasBooking(user.telegram_id));
    
    return matchesSurvey && matchesBooking;
  });

  const uniqueSurveys = Array.from(
    new Set(users.flatMap(user => [user.faculty, user.group]))
  ).sort();

  if (loading && users.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <div className="text-gray-500">
            {useCSVMode 
              ? 'Загрузка пользователей из CSV файла...' 
              : 'Загрузка пользователей из внешнего API...'
            }
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Пользователи</h1>
          <p className="text-gray-600">
            {useCSVMode 
              ? 'Пользователи с завершенными анкетами из локального CSV файла' 
              : 'Пользователи с завершенными анкетами из внешнего API'
            }
          </p>
        </div>
        <div className="flex items-center space-x-3">
          {useCSVMode && (
            <button
              onClick={handleExportCSV}
              className="flex items-center px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500"
              title="Экспорт данных из CSV"
            >
              <Download className="mr-2 h-4 w-4" />
              Экспорт CSV
            </button>
          )}
          <button
            onClick={() => setIsSurveyOverviewOpen(true)}
            className="flex items-center px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500"
            title="Обзор структуры анкеты"
          >
            <FileText className="mr-2 h-4 w-4" />
            Обзор анкеты
          </button>
          <button
            onClick={handleRefresh}
            className="flex items-center px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Обновить
          </button>
        </div>
      </div>

      {/* Краткая статистика анкеты */}
      {surveyStats && (
        <div className="mb-6 bg-gradient-to-r from-purple-50 to-blue-50 p-4 rounded-lg border border-purple-200">
          <div className="flex items-center space-x-2 mb-3">
            <FileText className="h-5 w-5 text-purple-600" />
            <h3 className="text-lg font-medium text-purple-900">
              Статистика анкеты {useCSVMode ? '(CSV режим)' : '(API режим)'}
            </h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">{surveyStats.total_responses}</div>
              <div className="text-sm text-purple-700">Всего ответов</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">
                {Math.round(surveyStats.completion_rate * 100)}%
              </div>
              <div className="text-sm text-purple-700">Процент завершения</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">
                {Math.round(surveyStats.average_completion_time / 60)} мин
              </div>
              <div className="text-sm text-purple-700">Среднее время</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">
                {Object.keys(surveyStats.question_stats || {}).length}
              </div>
              <div className="text-sm text-purple-700">Активных вопросов</div>
            </div>
          </div>
        </div>
      )}

      {/* API Health Status */}
      <div className="mb-6">
        <div className="flex items-center space-x-2">
          {apiHealth === true ? (
            <CheckCircle className="h-5 w-5 text-green-500" />
          ) : apiHealth === false ? (
            <AlertCircle className="h-5 w-5 text-red-500" />
          ) : (
            <Clock className="h-5 w-5 text-yellow-500" />
          )}
          <span className="text-sm text-gray-600">
            {useCSVMode 
              ? 'CSV режим активен - работаем с локальными данными' 
              : apiHealth === true 
                ? 'Внешний API доступен' 
                : apiHealth === false 
                  ? 'Внешний API недоступен' 
                  : 'Проверка доступности...'
            }
          </span>
        </div>
        {lastSync && (
          <div className="text-xs text-gray-500 mt-1">
            Последняя синхронизация: {new Date(lastSync).toLocaleString()}
          </div>
        )}
      </div>

      {/* Cache Toggle */}
      <div className="mb-6">
        <div className="flex items-center space-x-6">
          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={useCache}
              onChange={(e) => setUseCache(e.target.checked)}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              disabled={useCSVMode}
            />
            <span className="text-sm text-gray-700">Использовать кэш (5 минут)</span>
          </label>
          
          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={useCSVMode}
              onChange={(e) => handleToggleCSVMode(e.target.checked)}
              className="rounded border-gray-300 text-green-600 focus:ring-green-500"
            />
            <span className="text-sm text-gray-700">Режим CSV (локальные данные)</span>
          </label>
        </div>
        {useCSVMode && (
          <div className="mt-2 text-sm text-green-600">
            ✓ Работаем с локальным CSV файлом shaforms.responses.csv
          </div>
        )}
      </div>

      {/* Filter */}
      <div className="mb-6">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <Filter className="h-4 w-4 text-gray-500" />
            <select
              value={filterSurvey}
              onChange={(e) => setFilterSurvey(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Все факультеты и группы</option>
              {uniqueSurveys.map(survey => (
                <option key={survey} value={survey}>{survey}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center space-x-2">
            <Calendar className="h-4 w-4 text-gray-500" />
            <select
              value={filterBooking}
              onChange={(e) => setFilterBooking(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">Все пользователи</option>
              <option value="booked">Только записанные</option>
              <option value="not_booked">Только не записанные</option>
            </select>
          </div>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-md">
          <div className="flex items-center">
            <AlertCircle className="h-5 w-5 text-red-500 mr-2" />
            <span className="text-red-700">{error}</span>
          </div>
        </div>
      )}

      {/* Users List */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-medium text-gray-900">
              {useCSVMode 
                ? 'Пользователи из CSV файла' 
                : 'Пользователи с завершенными анкетами'
              }
            </h2>
            <span className="text-sm text-gray-500">
              {filteredUsers.length} из {users.length}
            </span>
          </div>
          {useCSVMode && (
            <div className="text-xs text-green-600 mt-1">
              📁 Источник: shaforms.responses.csv
            </div>
          )}
        </div>
        
        <div className="divide-y divide-gray-200">
          {filteredUsers.length === 0 ? (
            <div className="px-6 py-8 text-center text-gray-500">
              {users.length === 0 ? 'Нет пользователей' : 'Нет пользователей с выбранным фильтром'}
            </div>
          ) : (
            filteredUsers.map((user) => (
              <div key={user.telegram_id} className="px-6 py-4 hover:bg-gray-50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <div className="flex items-center text-gray-900">
                      <Users className="h-5 w-5 mr-2" />
                      <span className="font-medium">Telegram: {user.telegram_id}</span>
                    </div>
                    <div className="flex items-center text-gray-600">
                      <span>{user.full_name}</span>
                    </div>
                    <div className="text-sm text-gray-500">
                      {user.faculty} • {user.group}
                    </div>
                    <div className="text-sm text-gray-500">
                      {user.phone}
                    </div>
                    {/* Индикация записи */}
                    {hasBooking(user.telegram_id) && (
                      <div className="flex items-center text-green-600">
                        <Calendar className="h-4 w-4 mr-1" />
                        <span className="text-xs font-medium">Записан</span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center space-x-3">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                      {new Date(user.completed_at).toLocaleDateString()}
                    </span>
                    <button
                      onClick={() => handleViewProfile(user.telegram_id)}
                      className="inline-flex items-center px-2 py-1 text-xs font-medium text-blue-700 bg-blue-100 rounded hover:bg-blue-200 transition-colors"
                      title="Просмотреть профиль"
                    >
                      <Eye className="w-3 h-3 mr-1" />
                      Профиль
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Statistics */}
      {users.length > 0 && (
        <div className="mt-6 grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="text-sm font-medium text-gray-500">Всего пользователей</div>
            <div className="text-2xl font-bold text-gray-900">{users.length}</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="text-sm font-medium text-gray-500">Уникальных факультетов</div>
            <div className="text-2xl font-bold text-gray-900">
              {Array.from(new Set(users.map(user => user.faculty))).length}
            </div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="text-sm font-medium text-gray-500">Уникальных групп</div>
            <div className="text-2xl font-bold text-gray-900">
              {Array.from(new Set(users.map(user => user.group))).length}
            </div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="text-sm font-medium text-gray-500">
              {useCSVMode ? 'С telegram_id' : 'Записанных на собеседование'}
            </div>
            <div className="text-2xl font-bold text-green-600">
              {useCSVMode 
                ? users.filter(user => user.telegram_id > 0).length
                : users.filter(user => hasBooking(user.telegram_id)).length
              }
            </div>
          </div>
        </div>
      )}

      {/* User Profile Modal */}
      {selectedUserProfile && (
        <UserProfile
          telegramId={selectedUserProfile}
          isOpen={isProfileOpen}
          onClose={handleCloseProfile}
        />
      )}

      {/* Survey Overview Modal */}
      <SurveyOverview
        isOpen={isSurveyOverviewOpen}
        onClose={() => setIsSurveyOverviewOpen(false)}
      />
    </div>
  );
};

export default ExternalUsers;
