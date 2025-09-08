import React, { useState, useEffect } from 'react';
import { Users, AlertTriangle, RefreshCw, Eye, Mail, Phone, Calendar, GraduationCap, CheckCircle, XCircle, Clock, MessageSquare, PhoneCall, UserCheck, UserX, ChevronDown } from 'lucide-react';
import { externalUsersApi } from '../api';
import type { NoResponseUser, UserSurvey } from '../types';
import UserProfile from '../components/UserProfile';

const NoResponseUsers: React.FC = () => {
  const [users, setUsers] = useState<NoResponseUser[]>([]);
  const [userProfiles, setUserProfiles] = useState<Map<number, UserSurvey>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedUserProfile, setSelectedUserProfile] = useState<number | null>(null);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterFaculty, setFilterFaculty] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const data = await externalUsersApi.getNoResponseUsers();
      setUsers(data);
      
      // Загружаем профили пользователей через стандартный API
      const profiles = new Map<number, UserSurvey>();
      for (const user of data) {
        try {
          const profile = await externalUsersApi.getUserSurvey(user.telegram_id);
          profiles.set(user.telegram_id, profile);
        } catch (err) {
          console.warn(`Не удалось загрузить профиль для пользователя ${user.telegram_id}:`, err);
        }
      }
      setUserProfiles(profiles);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleViewProfile = (telegramId: number) => {
    setSelectedUserProfile(telegramId);
    setIsProfileOpen(true);
  };

  const handleCloseProfile = () => {
    setIsProfileOpen(false);
    setSelectedUserProfile(null);
  };

  // Функции для отображения статуса сообщения
  const getMessageStatusIcon = (status: string) => {
    switch (status) {
      case 'sent':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'pending':
        return <Clock className="h-4 w-4 text-yellow-500" />;
      case 'contacted':
        return <MessageSquare className="h-4 w-4 text-blue-500" />;
      case 'called':
        return <PhoneCall className="h-4 w-4 text-purple-500" />;
      case 'responded':
        return <UserCheck className="h-4 w-4 text-emerald-500" />;
      case 'ignored':
        return <UserX className="h-4 w-4 text-gray-500" />;
      default:
        return <Clock className="h-4 w-4 text-gray-500" />;
    }
  };

  const getMessageStatusText = (status: string) => {
    switch (status) {
      case 'sent':
        return 'Доставлено';
      case 'failed':
        return 'Не доставлено';
      case 'pending':
        return 'Ожидает';
      case 'contacted':
        return 'Связались';
      case 'called':
        return 'Позвонили';
      case 'responded':
        return 'Ответил';
      case 'ignored':
        return 'Проигнорировал';
      default:
        return 'Неизвестно';
    }
  };

  const getMessageStatusColor = (status: string) => {
    switch (status) {
      case 'sent':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'failed':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'contacted':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'called':
        return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'responded':
        return 'bg-emerald-100 text-emerald-800 border-emerald-200';
      case 'ignored':
        return 'bg-gray-100 text-gray-800 border-gray-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  // Функция для обновления статуса сообщения
  const updateMessageStatus = async (telegramId: number, newStatus: string) => {
    try {
      await externalUsersApi.updateMessageStatus(telegramId, 'signup', newStatus);
      
      // Обновляем локальное состояние
      setUsers(prevUsers => 
        prevUsers.map(user => {
          if (user.telegram_id === telegramId) {
            return {
              ...user,
              message_info: {
                ...user.message_info,
                status: newStatus
              }
            };
          }
          return user;
        })
      );
      
      console.log(`✅ Статус обновлен для пользователя ${telegramId}: ${newStatus}`);
    } catch (error: any) {
      console.error('Ошибка при обновлении статуса:', error);
      alert(`Ошибка при обновлении статуса: ${error.message}`);
    }
  };

  // Фильтрация пользователей
  const filteredUsers = users.filter(user => {
    const profile = userProfiles.get(user.telegram_id);
    
    const matchesSearch = searchTerm === '' || 
      (profile?.full_name && profile.full_name.toLowerCase().includes(searchTerm.toLowerCase())) ||
      user.telegram_id.toString().includes(searchTerm) ||
      (profile?.username && profile.username.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const matchesFaculty = filterFaculty === '' || (profile?.faculty === filterFaculty);
    const matchesStatus = filterStatus === '' || user.message_info.status === filterStatus;
    
    return matchesSearch && matchesFaculty && matchesStatus;
  });

  // Получаем уникальные факультеты для фильтра
  const faculties = Array.from(new Set(
    Array.from(userProfiles.values()).map(profile => profile.faculty)
  )).sort();
  
  // Получаем уникальные статусы для фильтра
  const statuses = [
    { value: 'sent', label: 'Доставлено', icon: CheckCircle, color: 'text-green-500' },
    { value: 'failed', label: 'Не доставлено', icon: XCircle, color: 'text-red-500' },
    { value: 'pending', label: 'Ожидает', icon: Clock, color: 'text-yellow-500' },
    { value: 'contacted', label: 'Связались', icon: MessageSquare, color: 'text-blue-500' },
    { value: 'called', label: 'Позвонили', icon: PhoneCall, color: 'text-purple-500' },
    { value: 'responded', label: 'Ответил', icon: UserCheck, color: 'text-emerald-500' },
    { value: 'ignored', label: 'Проигнорировал', icon: UserX, color: 'text-gray-500' }
  ];

  // Статистика
  const totalUsers = users.length;
  const filteredCount = filteredUsers.length;
  
  // Статистика по статусам сообщений
  const sentCount = users.filter(user => user.message_info?.status === 'sent').length;
  const failedCount = users.filter(user => user.message_info?.status === 'failed').length;
  const pendingCount = users.filter(user => user.message_info?.status === 'pending').length;
  const contactedCount = users.filter(user => user.message_info?.status === 'contacted').length;
  const calledCount = users.filter(user => user.message_info?.status === 'called').length;
  const respondedCount = users.filter(user => user.message_info?.status === 'responded').length;
  const ignoredCount = users.filter(user => user.message_info?.status === 'ignored').length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-600 mx-auto"></div>
          <p className="mt-2 text-gray-600">Загрузка пользователей без записи...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Заголовок */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Пользователи без записи</h1>
        <p className="text-gray-600 mt-2">
          Пользователи, которым была отправлена рассылка о записи, но они не записались на собеседование. 
          Включает как успешно доставленные, так и неудачные сообщения.
        </p>
      </div>

      {/* Статистика */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center">
            <AlertTriangle className="h-8 w-8 text-orange-500 mr-3" />
            <div>
              <div className="text-sm font-medium text-gray-500">Всего без записи</div>
              <div className="text-2xl font-bold text-orange-600">{totalUsers}</div>
            </div>
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center">
            <CheckCircle className="h-8 w-8 text-green-500 mr-3" />
            <div>
              <div className="text-sm font-medium text-gray-500">Доставлено</div>
              <div className="text-2xl font-bold text-green-600">{sentCount}</div>
            </div>
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center">
            <XCircle className="h-8 w-8 text-red-500 mr-3" />
            <div>
              <div className="text-sm font-medium text-gray-500">Не доставлено</div>
              <div className="text-2xl font-bold text-red-600">{failedCount}</div>
            </div>
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center">
            <Clock className="h-8 w-8 text-yellow-500 mr-3" />
            <div>
              <div className="text-sm font-medium text-gray-500">Ожидает</div>
              <div className="text-2xl font-bold text-yellow-600">{pendingCount}</div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Статистика по контактам */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center">
            <MessageSquare className="h-8 w-8 text-blue-500 mr-3" />
            <div>
              <div className="text-sm font-medium text-gray-500">Связались</div>
              <div className="text-2xl font-bold text-blue-600">{contactedCount}</div>
            </div>
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center">
            <PhoneCall className="h-8 w-8 text-purple-500 mr-3" />
            <div>
              <div className="text-sm font-medium text-gray-500">Позвонили</div>
              <div className="text-2xl font-bold text-purple-600">{calledCount}</div>
            </div>
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center">
            <UserCheck className="h-8 w-8 text-emerald-500 mr-3" />
            <div>
              <div className="text-sm font-medium text-gray-500">Ответил</div>
              <div className="text-2xl font-bold text-emerald-600">{respondedCount}</div>
            </div>
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center">
            <UserX className="h-8 w-8 text-gray-500 mr-3" />
            <div>
              <div className="text-sm font-medium text-gray-500">Проигнорировал</div>
              <div className="text-2xl font-bold text-gray-600">{ignoredCount}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Фильтры и поиск */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <label htmlFor="search" className="block text-sm font-medium text-gray-700 mb-2">
              Поиск
            </label>
            <input
              type="text"
              id="search"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
              placeholder="Поиск по имени, ID или username..."
            />
          </div>
          <div className="md:w-48">
            <label htmlFor="faculty" className="block text-sm font-medium text-gray-700 mb-2">
              Факультет
            </label>
            <select
              id="faculty"
              value={filterFaculty}
              onChange={(e) => setFilterFaculty(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
            >
              <option value="">Все факультеты</option>
              {faculties.map(faculty => (
                <option key={faculty} value={faculty}>{faculty}</option>
              ))}
            </select>
          </div>
          <div className="md:w-48">
            <label htmlFor="status" className="block text-sm font-medium text-gray-700 mb-2">
              Статус
            </label>
            <select
              id="status"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
            >
              <option value="">Все статусы</option>
              {statuses.map(status => (
                <option key={status.value} value={status.value}>{status.label}</option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <button
              onClick={loadUsers}
              className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 transition-colors"
            >
              <RefreshCw className="h-4 w-4" />
              Обновить
            </button>
          </div>
        </div>
      </div>

      {/* Ошибка */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <div className="flex">
            <AlertTriangle className="h-5 w-5 text-red-400 mr-3" />
            <div>
              <h3 className="text-sm font-medium text-red-800">Ошибка загрузки</h3>
              <p className="text-sm text-red-700 mt-1">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Список пользователей */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
            Пользователи без записи ({filteredCount})
          </h2>
        </div>
        
        {filteredUsers.length === 0 ? (
          <div className="text-center py-8">
            <Users className="h-12 w-12 mx-auto mb-4 text-gray-300" />
            <p className="text-lg text-gray-500">
              {searchTerm || filterFaculty || filterStatus ? 'Пользователи не найдены' : 'Все пользователи записались!'}
            </p>
            <p className="text-sm text-gray-400 mt-1">
              {searchTerm || filterFaculty || filterStatus ? 'Попробуйте изменить фильтры' : 'Отличная работа!'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {filteredUsers.map((user) => {
              const profile = userProfiles.get(user.telegram_id);
              return (
              <div key={user.telegram_id} className="p-6 hover:bg-gray-50 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-lg font-semibold text-gray-900">
                          {profile?.full_name || `Пользователь ${user.telegram_id}`}
                      </h3>
                      <span className="inline-flex items-center px-2 py-1 text-xs font-semibold rounded-full bg-orange-100 text-orange-800 border border-orange-200">
                        <AlertTriangle className="h-3 w-3 mr-1" />
                        Без записи
                      </span>
                        <span className={`inline-flex items-center px-2 py-1 text-xs font-semibold rounded-full border ${getMessageStatusColor(user.message_info.status)}`}>
                          {getMessageStatusIcon(user.message_info.status)}
                          <span className="ml-1">{getMessageStatusText(user.message_info.status)}</span>
                        </span>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm text-gray-600">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">ID:</span>
                        <span className="font-mono">{user.telegram_id}</span>
                      </div>
                      
                      {profile?.username && (
                        <div className="flex items-center gap-2">
                          <span className="font-medium">Username:</span>
                          <span>@{profile.username}</span>
                        </div>
                      )}
                      
                      {profile?.faculty && (
                      <div className="flex items-center gap-2">
                        <GraduationCap className="h-4 w-4" />
                          <span>{profile.faculty}</span>
                      </div>
                      )}
                      
                      {profile?.group && (
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4" />
                          <span>{profile.group}</span>
                      </div>
                      )}
                      
                      {profile?.phone && (
                        <div className="flex items-center gap-2">
                          <Phone className="h-4 w-4" />
                          <span>{profile.phone}</span>
                        </div>
                      )}
                      
                      {profile?.completed_at && (
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4" />
                        <span>
                            {(() => {
                              const date = new Date(profile.completed_at);
                              if (isNaN(date.getTime())) return 'Неизвестно';
                              
                              // Добавляем 3 часа к UTC времени для получения московского времени
                              const moscowTime = new Date(date.getTime() + (3 * 60 * 60 * 1000));
                              
                              return moscowTime.toLocaleDateString('ru-RU');
                            })()}
                        </span>
                      </div>
                      )}
                      
                          <div className="flex items-center gap-2">
                            <span className="font-medium">Рассылка:</span>
                        <span className="text-sm">
                          {(() => {
                            const date = new Date(user.message_info.broadcast_created_at);
                            if (isNaN(date.getTime())) return 'Неизвестно';
                            
                            // Добавляем 3 часа к UTC времени для получения московского времени
                            const moscowTime = new Date(date.getTime() + (3 * 60 * 60 * 1000));
                            
                            return moscowTime.toLocaleString('ru-RU', {
                              day: '2-digit',
                              month: '2-digit',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                              second: '2-digit'
                            });
                          })()}
                            </span>
                          </div>
                          
                          {user.message_info.sent_at && (
                            <div className="flex items-center gap-2">
                              <span className="font-medium">Отправлено:</span>
                          <span className="text-sm">
                            {(() => {
                              const date = new Date(user.message_info.sent_at);
                              if (isNaN(date.getTime())) return 'Неизвестно';
                              
                              // Добавляем 3 часа к UTC времени для получения московского времени
                              const moscowTime = new Date(date.getTime() + (3 * 60 * 60 * 1000));
                              
                              return moscowTime.toLocaleString('ru-RU', {
                                day: '2-digit',
                                month: '2-digit',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                                second: '2-digit'
                              });
                            })()}
                              </span>
                            </div>
                          )}
                          
                          {user.message_info.retry_count > 0 && (
                            <div className="flex items-center gap-2">
                              <span className="font-medium">Повторов:</span>
                          <span className="text-sm bg-yellow-100 text-yellow-800 px-2 py-1 rounded-full text-xs">
                            {user.message_info.retry_count}
                          </span>
                            </div>
                          )}
                          
                          {user.message_info.error && (
                        <div className="col-span-full mt-2">
                          <div className="bg-red-50 border border-red-200 rounded-md p-3">
                            <div className="flex items-start gap-2">
                              <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
                              <div>
                                <span className="font-medium text-red-800 text-sm">Ошибка доставки:</span>
                                <p className="text-red-700 text-sm mt-1">{user.message_info.error}</p>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2 ml-4">
                    <button
                      onClick={() => handleViewProfile(user.telegram_id)}
                      className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-blue-600 bg-blue-50 rounded-md hover:bg-blue-100 transition-colors"
                    >
                      <Eye className="h-4 w-4" />
                      Профиль
                    </button>
                    
                    <button
                      onClick={() => {
                        const telegramUrl = `https://t.me/${profile?.username || user.telegram_id}`;
                        window.open(telegramUrl, '_blank');
                      }}
                      className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-green-600 bg-green-50 rounded-md hover:bg-green-100 transition-colors"
                      disabled={!profile?.username}
                    >
                      <Mail className="h-4 w-4" />
                      Написать
                    </button>
                    
                    {/* Выпадающий список для изменения статуса */}
                    <div className="relative">
                      <select
                        value={user.message_info?.status || 'sent'}
                        onChange={(e) => updateMessageStatus(user.telegram_id, e.target.value)}
                        className="appearance-none bg-white border border-gray-300 rounded-md px-3 py-2 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                      >
                        {statuses.map(status => (
                          <option key={status.value} value={status.value}>
                            {status.label}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                    </div>
                  </div>
                </div>
              </div>
              );
            })}
          </div>
        )}
      </div>

      {/* User Profile Modal */}
      {selectedUserProfile && (
        <UserProfile
          telegramId={selectedUserProfile}
          isOpen={isProfileOpen}
          onClose={handleCloseProfile}
        />
      )}
    </div>
  );
};

export default NoResponseUsers;
