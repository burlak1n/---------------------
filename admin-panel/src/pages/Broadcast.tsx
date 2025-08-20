import React, { useState } from 'react';
import { Send, Users, MessageCircle, AlertCircle } from 'lucide-react';
import { broadcastApi } from '../api';
import type { BroadcastRequest, BroadcastResponse } from '../types';

const Broadcast: React.FC = () => {
  const [message, setMessage] = useState('');
  const [includeUsersWithoutTelegram, setIncludeUsersWithoutTelegram] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BroadcastResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) {
      setError('Введите сообщение для рассылки');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const request: BroadcastRequest = {
        message: message.trim(),
        include_users_without_telegram: includeUsersWithoutTelegram,
      };

      const response = await broadcastApi.send(request);
      setResult(response);
      setMessage('');
    } catch (err) {
      setError('Ошибка при отправке рассылки. Попробуйте позже.');
      console.error('Broadcast error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handlePreview = () => {
    if (!message.trim()) {
      setError('Введите сообщение для предварительного просмотра');
      return;
    }
    setError(null);
  };

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Рассылка сообщений</h1>
        <p className="text-gray-600">Отправка уведомлений всем пользователям системы</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Форма рассылки */}
        <div className="bg-white rounded-lg shadow border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-medium text-gray-900">Создать рассылку</h2>
          </div>
          <div className="p-6">
            <form onSubmit={handleSubmit}>
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Сообщение для рассылки
                </label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={6}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  placeholder="Введите текст сообщения для рассылки..."
                  required
                />
                <p className="mt-1 text-sm text-gray-500">
                  {message.length} символов
                </p>
              </div>

              <div className="mb-6">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={includeUsersWithoutTelegram}
                    onChange={(e) => setIncludeUsersWithoutTelegram(e.target.checked)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="ml-2 text-sm text-gray-700">
                    Включить пользователей без Telegram ID
                  </span>
                </label>
                <p className="mt-1 text-sm text-gray-500">
                  Если отмечено, сообщение будет отправлено всем пользователям, включая тех, у кого нет Telegram ID
                </p>
              </div>

              {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
                  <div className="flex items-center">
                    <AlertCircle className="h-4 w-4 text-red-400 mr-2" />
                    <span className="text-sm text-red-700">{error}</span>
                  </div>
                </div>
              )}

              <div className="flex space-x-3">
                <button
                  type="button"
                  onClick={handlePreview}
                  className="px-4 py-2 text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500"
                >
                  Предварительный просмотр
                </button>
                <button
                  type="submit"
                  disabled={loading || !message.trim()}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Отправка...
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4 mr-2" />
                      Отправить рассылку
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Результат и статистика */}
        <div className="space-y-6">
          {/* Предварительный просмотр */}
          {message.trim() && (
            <div className="bg-white rounded-lg shadow border border-gray-200">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-medium text-gray-900">Предварительный просмотр</h3>
              </div>
              <div className="p-6">
                <div className="bg-gray-50 rounded-md p-4">
                  <p className="text-gray-900 whitespace-pre-wrap">{message}</p>
                </div>
                <div className="mt-4 text-sm text-gray-500">
                  <p>Это сообщение будет отправлено всем пользователям системы</p>
                </div>
              </div>
            </div>
          )}

          {/* Результат рассылки */}
          {result && (
            <div className="bg-white rounded-lg shadow border border-gray-200">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-medium text-gray-900">Результат рассылки</h3>
              </div>
              <div className="p-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3 bg-green-50 rounded-md">
                    <span className="text-sm font-medium text-green-800">Статус</span>
                    <span className="text-sm text-green-600">Успешно отправлено</span>
                  </div>
                  
                  <div className="grid grid-cols-1 gap-3">
                    <div className="flex items-center justify-between p-3 bg-blue-50 rounded-md">
                      <div className="flex items-center">
                        <Users className="h-4 w-4 text-blue-500 mr-2" />
                        <span className="text-sm font-medium text-blue-800">Всего пользователей</span>
                      </div>
                      <span className="text-sm text-blue-600 font-semibold">{result.users_count}</span>
                    </div>
                    
                    <div className="flex items-center justify-between p-3 bg-green-50 rounded-md">
                      <div className="flex items-center">
                        <MessageCircle className="h-4 w-4 text-green-500 mr-2" />
                        <span className="text-sm font-medium text-green-800">С Telegram ID</span>
                      </div>
                      <span className="text-sm text-green-600 font-semibold">{result.users_with_telegram}</span>
                    </div>
                    
                    <div className="flex items-center justify-between p-3 bg-yellow-50 rounded-md">
                      <div className="flex items-center">
                        <AlertCircle className="h-4 w-4 text-yellow-500 mr-2" />
                        <span className="text-sm font-medium text-yellow-800">Без Telegram ID</span>
                      </div>
                      <span className="text-sm text-yellow-600 font-semibold">{result.users_without_telegram}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Информация о рассылке */}
          <div className="bg-white rounded-lg shadow border border-gray-200">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-medium text-gray-900">Информация о рассылке</h3>
            </div>
            <div className="p-6">
              <div className="space-y-3 text-sm text-gray-600">
                <div className="flex items-start">
                  <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 mr-3 flex-shrink-0"></div>
                  <p>Сообщения отправляются через Telegram Bot API</p>
                </div>
                <div className="flex items-start">
                  <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 mr-3 flex-shrink-0"></div>
                  <p>Пользователи без Telegram ID получат уведомление при следующем входе в систему</p>
                </div>
                <div className="flex items-start">
                  <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 mr-3 flex-shrink-0"></div>
                  <p>Рассылка выполняется асинхронно для больших объемов</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Broadcast;
