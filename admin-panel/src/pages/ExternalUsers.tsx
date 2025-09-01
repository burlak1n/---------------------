import React, { useEffect, useState } from 'react';
import { Users, RefreshCw, AlertCircle, CheckCircle, Clock, Download, Filter, Eye, Calendar, FileText, Search } from 'lucide-react';
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
  const [searchName, setSearchName] = useState<string>('');
  const [useLocalMode, setUseLocalMode] = useState(false);
  const [localMode, setLocalMode] = useState<'json' | 'debug'>('json');
  
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
  }, [useLocalMode, localMode]);

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

  const handleToggleLocalMode = (useLocal: boolean) => {
    console.log(`Переключаем локальный режим на: ${useLocal}, режим: ${localMode}`);
    setUseLocalMode(useLocal);
    externalUsersApi.toggleLocalMode(useLocal, localMode);
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

  const handleLocalModeChange = (mode: 'json' | 'debug') => {
    console.log(`Переключаем локальный режим данных на: ${mode}`);
    setLocalMode(mode);
    if (useLocalMode) {
      externalUsersApi.toggleLocalMode(true, mode);
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
    }
  };

  const fetchUsers = async () => {
    try {
      console.log(`fetchUsers: начало загрузки, локальный режим: ${useLocalMode}`);
      setLoading(true);
      setError(null);
      
      let data;
      if (useLocalMode) {
        console.log('fetchUsers: загружаем данные в локальный режиме');
        data = await externalUsersApi.getCompletedUsers();
      } else {
        console.log('fetchUsers: загружаем данные в API режиме');
        data = useCache 
          ? await externalUsersApi.getCompletedUsersCached()
          : await externalUsersApi.getCompletedUsers();
      }
      
      console.log(`fetchUsers: получено ${data.length} пользователей`);
      console.log('fetchUsers: первые 2 пользователя:', data.slice(0, 2));
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

  const clearAllFilters = () => {
    setSearchName('');
    setFilterSurvey('');
    setFilterBooking('all');
  };

  // Проверяем, есть ли запись у пользователя
  const hasBooking = (telegramId: number): boolean => {
    return bookings.some(booking => booking.telegram_id === telegramId);
  };

  const handleExportData = () => {
    const csvContent = [
      'Full Name,Phone,Username,Faculty,Group,Completed At,Telegram ID',
      ...users.map(user => 
        `"${user.full_name}","${user.phone}",@${user.username},"${user.faculty}","${user.group}","${user.completed_at}",${user.telegram_id}`
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
    
    const matchesName = !searchName || 
      user.full_name.toLowerCase().includes(searchName.toLowerCase()) ||
      user.username.toLowerCase().includes(searchName.toLowerCase());
    
    return matchesSurvey && matchesBooking && matchesName;
  });

  // Логируем первые несколько пользователей для отладки
  if (users.length > 0 && users.length <= 3) {
    console.log('filteredUsers: все пользователи:', users);
  }

  const uniqueSurveys = Array.from(
    new Set(users.flatMap(user => [user.faculty, user.group]))
  ).sort();

  if (loading && users.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <div className="text-gray-500">
            {useLocalMode 
              ? 'Загрузка пользователей из локального файла...' 
              : 'Загрузка пользователей из внешнего API...'
            }
          </div>
        </div>
        {searchName && (
          <div className="mt-2 text-sm text-blue-600">
            🔍 Поиск по ФИО и username работает в реальном времени
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Пользователи</h1>
          <p className="text-gray-600">
            {useLocalMode 
              ? 'Пользователи с завершенными анкетами из локального локального файла' 
              : 'Пользователи с завершенными анкетами из внешнего API'
            }
          </p>
        </div>
        <div className="flex items-center space-x-3">
          {useLocalMode && (
            <button
              onClick={handleExportData}
              className="flex items-center px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500"
              title="Экспорт данных (CSV)"
            >
              <Download className="mr-2 h-4 w-4" />
              Экспорт данных
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
              Статистика анкеты {useLocalMode ? `(${localMode === 'json' ? 'JSON файл' : 'Debug данные'})` : '(API режим)'}
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
            {useLocalMode 
              ? 'локальный режим активен - работаем с локальными данными' 
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
              disabled={useLocalMode}
            />
            <span className="text-sm text-gray-700">Использовать кэш (5 минут)</span>
          </label>
          
          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={useLocalMode}
              onChange={(e) => handleToggleLocalMode(e.target.checked)}
              className="rounded border-gray-300 text-green-600 focus:ring-green-500"
            />
            <span className="text-sm text-gray-700">Локальный режим (JSON/Debug данные)</span>
          </label>
          
          {useLocalMode && (
            <div className="mt-2 flex items-center space-x-4">
              <label className="flex items-center space-x-2">
                <input
                  type="radio"
                  checked={localMode === 'json'}
                  onChange={() => handleLocalModeChange('json')}
                  className="text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">JSON файл</span>
              </label>
              <label className="flex items-center space-x-2">
                <input
                  type="radio"
                  checked={localMode === 'debug'}
                  onChange={() => handleLocalModeChange('debug')}
                  className="text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">Debug данные</span>
              </label>
            </div>
          )}
        </div>
        {useLocalMode && (
          <div className="mt-2 text-sm text-green-600">
            ✓ Работаем с {localMode === 'json' ? 'локальным JSON файлом shaforms.responses.json' : 'тестовыми debug данными'}
          </div>
        )}
      </div>

      {/* Filter */}
      <div className="mb-6">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <Search className="h-4 w-4 text-gray-500" />
            <div className="relative">
              <input
                type="text"
                placeholder="Поиск по ФИО или username..."
                value={searchName}
                onChange={(e) => setSearchName(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 w-64 pr-10"
              />
              {searchName && (
                <button
                  onClick={() => setSearchName('')}
                  className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  title="Очистить поиск"
                >
                  ×
                </button>
              )}
            </div>
          </div>
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
          {(searchName || filterSurvey || filterBooking !== 'all') && (
            <button
              onClick={clearAllFilters}
              className="px-3 py-2 text-sm text-gray-600 hover:text-gray-800 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
              title="Очистить все фильтры"
            >
              Очистить фильтры
            </button>
          )}
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
              {useLocalMode 
                ? `Пользователи из ${localMode === 'json' ? 'JSON файла' : 'debug данных'}` 
                : 'Пользователи с завершенными анкетами'
              }
            </h2>
            <span className="text-sm text-gray-500">
              {filteredUsers.length} из {users.length}
              {searchName && (
                <span className="ml-2 text-blue-600">
                  • Поиск: "{searchName}"
                </span>
              )}
            </span>
          </div>
          {useLocalMode && (
            <div className="text-xs text-green-600 mt-1">
              📁 Источник: {localMode === 'json' ? 'shaforms.responses.json' : 'debug данные'}
            </div>
          )}
        </div>
        
        {/* Заголовки колонок */}
        <div className="px-6 py-3 bg-gray-50 border-b border-gray-200">
          <div className="grid grid-cols-12 gap-4 text-xs font-medium text-gray-500 uppercase tracking-wide">
            <div className="col-span-3">ФИО</div>
            <div className="col-span-1">Телефон</div>
            <div className="col-span-2">Username</div>
            <div className="col-span-4">Факультет / Группа</div>
            <div className="col-span-1">Статус</div>
            <div className="col-span-1">Дата</div>
          </div>
        </div>
        
        <div className="divide-y divide-gray-200">
          {filteredUsers.length === 0 ? (
            <div className="px-6 py-8 text-center text-gray-500">
              {users.length === 0 ? 'Нет пользователей' : 
                searchName ? `Нет пользователей по запросу "${searchName}" (ФИО или username)` : 
                'Нет пользователей с выбранным фильтром'
              }
            </div>
          ) : (
            filteredUsers.map((user) => (
              <div key={user.telegram_id} className="px-6 py-4 hover:bg-gray-50 transition-colors duration-150 border-l-4 border-l-transparent hover:border-l-blue-500">
                <div className="grid grid-cols-12 gap-4 items-center">
                  {/* ФИО */}
                  <div className="col-span-3 flex items-center min-w-0">
                    <Users className="h-5 w-5 mr-2 text-gray-400 flex-shrink-0" />
                    <span className="font-medium text-gray-900 truncate">{user.full_name}</span>
                  </div>
                  
                  {/* Телефон */}
                  <div className="col-span-1 text-sm text-gray-600 font-mono truncate">
                    <a 
                      href={`tel:${user.phone}`} 
                      className="hover:text-blue-600 hover:underline transition-colors"
                      title="Позвонить"
                    >
                      {user.phone}
                    </a>
                  </div>
                  
                  {/* Username */}
                  <div className="col-span-2 text-sm text-blue-600 font-medium truncate">
                    <a 
                      href={`https://t.me/${user.username}`} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="hover:text-blue-800 hover:underline transition-colors"
                      title="Открыть в Telegram"
                    >
                      {user.username}
                    </a>
                  </div>
                  
                  {/* Факультет и группа */}
                  <div className="col-span-4 text-sm text-gray-500 min-w-0">
                    <div className="truncate">{user.faculty}</div>
                    <div className="text-xs text-gray-400">{user.group}</div>
                  </div>
                  
                  {/* Статус записи */}
                  <div className="col-span-1 text-center">
                    {hasBooking(user.telegram_id) ? (
                      <div className="flex items-center justify-center text-green-600">
                        <Calendar className="h-4 w-4 mr-1" />
                        <span className="text-xs font-medium">Записан</span>
                      </div>
                    ) : (
                      <div className="text-xs text-gray-400">-</div>
                    )}
                  </div>
                  
                  {/* Дата завершения */}
                  <div className="col-span-1 text-xs text-gray-500 text-center">
                    {new Date(user.completed_at).toLocaleDateString()}
                  </div>
                </div>
                
                {/* Кнопка профиля под строкой */}
                <div className="mt-3 flex justify-end">
                  <button
                    onClick={() => handleViewProfile(user.telegram_id)}
                    className="inline-flex items-center px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-100 rounded hover:bg-blue-200 transition-colors"
                    title="Просмотреть профиль"
                  >
                    <Eye className="w-3 h-3 mr-1" />
                    Профиль
                  </button>
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
              {useLocalMode ? 'С telegram_id' : 'Записанных на собеседование'}
            </div>
            <div className="text-2xl font-bold text-green-600">
              {useLocalMode 
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
