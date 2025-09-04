import React, { useState, useEffect } from 'react';
import { User, RefreshCw, X } from 'lucide-react';
import { usersApi } from '../api';
import { useAuth } from '../contexts/AuthContext';
import type { User as UserType } from '../types';

const Roles: React.FC = () => {
  const { userProfile, updateUserRole, checkUserRole } = useAuth();
  const [users, setUsers] = useState<UserType[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newTelegramId, setNewTelegramId] = useState<string>('');
  const [addingUser, setAddingUser] = useState(false);


  const loadUsers = async () => {
    try {
      setLoading(true);
      setError(null);
      const responsibleIds = await usersApi.getAll();
      // Преобразуем массив ID в массив объектов User для совместимости с UI
      const usersData = responsibleIds.map((telegram_id: number) => ({ telegram_id, role: 1 }));
      setUsers(usersData);
      
      // Проверяем актуальную роль текущего пользователя
      if (userProfile) {
        await checkUserRole(userProfile.telegram_id);
      }
    } catch (err: any) {
      setError(err.message || 'Ошибка при загрузке пользователей');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleRoleChange = async (telegramId: number, newRole: number) => {
    try {
      setSaving(telegramId);
      setError(null);
      
      await usersApi.update(telegramId, { role: newRole });
      
      // Если удаляем себя, обновляем роль в контексте
      if (userProfile && telegramId === userProfile.telegram_id) {
        updateUserRole(newRole);
      }
      
      // Удаляем пользователя из списка (всегда переводим в роль 0)
      setUsers(prevUsers => prevUsers.filter(user => user.telegram_id !== telegramId));
    } catch (err: any) {
      setError(err.message || 'Ошибка при удалении пользователя');
    } finally {
      setSaving(null);
    }
  };

  const handleAddUser = async () => {
    if (!newTelegramId.trim()) {
      setError('Введите Telegram ID');
      return;
    }

    const telegramId = parseInt(newTelegramId);
    if (isNaN(telegramId)) {
      setError('Telegram ID должен быть числом');
      return;
    }

    try {
      setAddingUser(true);
      setError(null);
      
      await usersApi.create({ telegram_id: telegramId, role: 1 });
      
      // Если добавляем себя, обновляем роль в контексте
      if (userProfile && telegramId === userProfile.telegram_id) {
        updateUserRole(1);
      }
      
      // Добавляем пользователя в список
      setUsers(prevUsers => [...prevUsers, { telegram_id: telegramId, role: 1 }]);
      setNewTelegramId('');
    } catch (err: any) {
      setError(err.message || 'Ошибка при добавлении пользователя');
    } finally {
      setAddingUser(false);
    }
  };


  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Управление ролями</h1>
          <p className="text-gray-600">Добавление ответственных пользователей (роль 1)</p>
        </div>
        <button
          onClick={loadUsers}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
        >
          <RefreshCw className="h-4 w-4" />
          Обновить
        </button>
      </div>

      {/* Форма добавления нового пользователя */}
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">Добавить ответственного пользователя</h2>
        <div className="flex gap-4">
          <input
            type="text"
            placeholder="Telegram ID"
            value={newTelegramId}
            onChange={(e) => setNewTelegramId(e.target.value)}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
          />
          <button
            onClick={handleAddUser}
            disabled={addingUser}
            className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors disabled:opacity-50"
          >
            {addingUser ? 'Добавление...' : 'Добавить'}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      )}

      <div className="bg-white shadow rounded-lg">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-medium text-gray-900">Ответственные пользователи</h2>
        </div>
        
        <div className="p-6">
          {users.length === 0 ? (
            <div className="text-center py-8">
              <User className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500">Ответственные пользователи не найдены</p>
              <p className="text-gray-400 text-sm mt-2">Добавьте пользователей с помощью формы выше</p>
            </div>
          ) : (
            <div className="space-y-3">
              {users.map((user) => (
                <div key={user.telegram_id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                  <span className="text-sm font-medium text-gray-900">
                    {user.telegram_id}
                  </span>
                  <button
                    onClick={() => handleRoleChange(user.telegram_id, 0)}
                    disabled={saving === user.telegram_id}
                    className={`inline-flex items-center justify-center w-8 h-8 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 ${
                      saving === user.telegram_id 
                        ? 'opacity-50 cursor-not-allowed bg-gray-100' 
                        : 'bg-red-100 hover:bg-red-200 text-red-600 hover:text-red-700'
                    }`}
                    title="Удалить из ответственных"
                  >
                    {saving === user.telegram_id ? (
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-red-600"></div>
                    ) : (
                      <X className="h-4 w-4" />
                    )}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Roles;
