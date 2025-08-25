import React, { useEffect, useState } from 'react';
import { Users, RefreshCw, AlertCircle, CheckCircle, Clock, Download, Filter } from 'lucide-react';
import { externalUsersApi } from '../api';
import type { ExternalUser } from '../types';

const ExternalUsers: React.FC = () => {
  const [users, setUsers] = useState<ExternalUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [apiHealth, setApiHealth] = useState<boolean | null>(null);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [useCache, setUseCache] = useState(true);
  const [filterSurvey, setFilterSurvey] = useState<string>('');

  useEffect(() => {
    checkApiHealth();
    fetchUsers();
  }, []);

  const checkApiHealth = async () => {
    const isHealthy = await externalUsersApi.checkHealth();
    setApiHealth(isHealthy);
  };

  const fetchUsers = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const data = useCache 
        ? await externalUsersApi.getCompletedUsersCached()
        : await externalUsersApi.getCompletedUsers();
      
      setUsers(data);
      setLastSync(new Date().toISOString());
    } catch (err: any) {
      setError(err.message);
      console.error('Error fetching external users:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    externalUsersApi.clearCache();
    await fetchUsers();
  };

  const handleExportCSV = () => {
    const csvContent = [
      'ID,Telegram ID,Created At,Completed Surveys',
      ...users.map(user => 
        `${user._id.$oid},${user.telegram_id},"${user.created_at}","${user.completed_surveys.join('; ')}"`
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

  const filteredUsers = users.filter(user => 
    !filterSurvey || user.completed_surveys.some(survey => 
      survey.toLowerCase().includes(filterSurvey.toLowerCase())
    )
  );

  const uniqueSurveys = Array.from(
    new Set(users.flatMap(user => user.completed_surveys))
  ).sort();

  if (loading && users.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Загрузка пользователей из внешнего API...</div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Внешние пользователи</h1>
          <p className="text-gray-600">Пользователи с завершенными анкетами из внешнего API</p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={handleExportCSV}
            className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <Download className="mr-2 h-4 w-4" />
            Экспорт CSV
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
            {apiHealth === true 
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
        <label className="flex items-center space-x-2">
          <input
            type="checkbox"
            checked={useCache}
            onChange={(e) => setUseCache(e.target.checked)}
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm text-gray-700">Использовать кэш (5 минут)</span>
        </label>
      </div>

      {/* Filter */}
      <div className="mb-6">
        <div className="flex items-center space-x-3">
          <Filter className="h-4 w-4 text-gray-500" />
          <select
            value={filterSurvey}
            onChange={(e) => setFilterSurvey(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Все анкеты</option>
            {uniqueSurveys.map(survey => (
              <option key={survey} value={survey}>{survey}</option>
            ))}
          </select>
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
              Пользователи с завершенными анкетами
            </h2>
            <span className="text-sm text-gray-500">
              {filteredUsers.length} из {users.length}
            </span>
          </div>
        </div>
        
        <div className="divide-y divide-gray-200">
          {filteredUsers.length === 0 ? (
            <div className="px-6 py-8 text-center text-gray-500">
              {users.length === 0 ? 'Нет пользователей' : 'Нет пользователей с выбранной анкетой'}
            </div>
          ) : (
            filteredUsers.map((user) => (
              <div key={user._id} className="px-6 py-4 hover:bg-gray-50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <div className="flex items-center text-gray-900">
                      <Users className="h-5 w-5 mr-2" />
                      <span className="font-medium">ID: {user._id.$oid}</span>
                    </div>
                    <div className="flex items-center text-gray-600">
                      <span>Telegram: {user.telegram_id}</span>
                    </div>
                    <div className="text-sm text-gray-500">
                      Создан: {new Date(user.created_at).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {user.completed_surveys.map((survey, index) => (
                      <span
                        key={index}
                        className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800"
                      >
                        {survey}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Statistics */}
      {users.length > 0 && (
        <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="text-sm font-medium text-gray-500">Всего пользователей</div>
            <div className="text-2xl font-bold text-gray-900">{users.length}</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="text-sm font-medium text-gray-500">Уникальных анкет</div>
            <div className="text-2xl font-bold text-gray-900">{uniqueSurveys.length}</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="text-sm font-medium text-gray-500">Среднее анкет на пользователя</div>
            <div className="text-2xl font-bold text-gray-900">
              {(users.reduce((sum, user) => sum + user.completed_surveys.length, 0) / users.length).toFixed(1)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ExternalUsers;
