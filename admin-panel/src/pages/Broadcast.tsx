import React, { useState, useEffect } from 'react';
import { Send, Users, MessageCircle, AlertCircle, RefreshCw, X, CheckCircle, Clock, AlertTriangle } from 'lucide-react';
import { broadcastApi } from '../api';
import type { 
  CreateBroadcastCommand, 
  BroadcastCreatedResponse, 
  BroadcastStatusResponse,
  BroadcastMessageRecord,
  BroadcastStatus,
  MessageStatus,
  BroadcastSummary
} from '../types';

const Broadcast: React.FC = () => {
  const [message, setMessage] = useState('');
  const [includeUsersWithoutTelegram, setIncludeUsersWithoutTelegram] = useState(false);
  const [loading, setLoading] = useState(false);
  const [currentBroadcast, setCurrentBroadcast] = useState<BroadcastCreatedResponse | null>(null);
  const [broadcastStatus, setBroadcastStatus] = useState<BroadcastStatusResponse | null>(null);
  const [broadcastHistory, setBroadcastHistory] = useState<BroadcastSummary[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pollingInterval, setPollingInterval] = useState<NodeJS.Timeout | null>(null);

  // Очистка интервала при размонтировании
  useEffect(() => {
    return () => {
      if (pollingInterval) {
        clearInterval(pollingInterval);
      }
    };
  }, [pollingInterval]);

  // Polling для обновления статуса
  useEffect(() => {
    // Очищаем предыдущий интервал при изменении currentBroadcast
    if (pollingInterval) {
      clearInterval(pollingInterval);
      setPollingInterval(null);
    }

    if (currentBroadcast && currentBroadcast.status !== 'completed' && currentBroadcast.status !== 'failed') {
      const interval = setInterval(async () => {
        try {
          const status = await broadcastApi.getStatus(currentBroadcast.broadcast_id);
          if (status) {
            setBroadcastStatus(status);
            
            // Останавливаем polling если рассылка завершена
            if (status.broadcast.status === 'completed' || status.broadcast.status === 'failed') {
              clearInterval(interval);
              setPollingInterval(null);
              // Обновляем currentBroadcast с финальным статусом
              setCurrentBroadcast(prev => prev ? { ...prev, status: status.broadcast.status } : null);
              // Обновляем историю после завершения рассылки
              loadBroadcastHistory();
            }
          }
        } catch (err) {
          console.error('Failed to fetch broadcast status:', err);
        }
      }, 2000); // Обновляем каждые 2 секунды

      setPollingInterval(interval);
    }
  }, [currentBroadcast]);

  // Загрузка истории рассылок
  useEffect(() => {
    loadBroadcastHistory();
  }, []);

  const loadBroadcastHistory = async () => {
    setHistoryLoading(true);
    try {
      const history = await broadcastApi.getAll();
      setBroadcastHistory(history);
    } catch (err) {
      console.error('Failed to load broadcast history:', err);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) {
      setError('Введите сообщение для рассылки');
      return;
    }

    setLoading(true);
    setError(null);
    setCurrentBroadcast(null);
    setBroadcastStatus(null);

    try {
      const command: CreateBroadcastCommand = {
        message: message.trim(),
        include_users_without_telegram: includeUsersWithoutTelegram,
      };

      const response = await broadcastApi.create(command);
      setCurrentBroadcast(response);
      setMessage('');
      // Обновляем историю после создания новой рассылки
      loadBroadcastHistory();
    } catch (err) {
      setError('Ошибка при создании рассылки. Попробуйте позже.');
      console.error('Broadcast error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!currentBroadcast) return;

    try {
      await broadcastApi.cancel(currentBroadcast.broadcast_id);
      setCurrentBroadcast(null);
      setBroadcastStatus(null);
      if (pollingInterval) {
        clearInterval(pollingInterval);
        setPollingInterval(null);
      }
    } catch (err) {
      setError('Ошибка при отмене рассылки');
      console.error('Cancel error:', err);
    }
  };

  const handleRetry = async (userId: number) => {
    if (!currentBroadcast) return;

    try {
      await broadcastApi.retryMessage(currentBroadcast.broadcast_id, userId);
      // Обновляем статус
      const status = await broadcastApi.getStatus(currentBroadcast.broadcast_id);
      if (status) {
        setBroadcastStatus(status);
      }
    } catch (err) {
      setError('Ошибка при повторной отправке');
      console.error('Retry error:', err);
    }
  };

  const handleViewDetails = async (broadcastId: string) => {
    try {
      const status = await broadcastApi.getStatus(broadcastId);
      if (status) {
        setBroadcastStatus(status);
        setCurrentBroadcast({ broadcast_id: broadcastId, status: status.broadcast.status });
        
        // Если рассылка завершена, останавливаем polling
        if (status.broadcast.status === 'completed' || status.broadcast.status === 'failed') {
          if (pollingInterval) {
            clearInterval(pollingInterval);
            setPollingInterval(null);
          }
        }
        
        // Прокручиваем к деталям
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    } catch (err) {
      setError('Ошибка при загрузке деталей рассылки');
      console.error('View details error:', err);
    }
  };

  const getStatusIcon = (status: BroadcastStatus) => {
    switch (status) {
      case 'pending':
        return <Clock className="w-5 h-5 text-yellow-500" />;
      case 'in_progress':
        return <RefreshCw className="w-5 h-5 text-blue-500 animate-spin" />;
      case 'completed':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'failed':
        return <AlertTriangle className="w-5 h-5 text-red-500" />;
    }
  };

  const getMessageStatusIcon = (status: MessageStatus) => {
    switch (status) {
      case 'pending':
        return <Clock className="w-4 h-4 text-yellow-500" />;
      case 'sent':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'failed':
        return <AlertTriangle className="w-4 h-4 text-red-500" />;
      case 'retrying':
        return <RefreshCw className="w-4 h-4 text-blue-500 animate-spin" />;
    }
  };

  const getBroadcastStatusIcon = (status: BroadcastStatus) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'failed':
        return <AlertTriangle className="w-4 h-4 text-red-500" />;
      case 'pending':
        return <Clock className="w-4 h-4 text-yellow-500" />;
      case 'in_progress':
        return <RefreshCw className="w-4 h-4 text-blue-500 animate-spin" />;
      default:
        return <Clock className="w-4 h-4 text-gray-500" />;
    }
  };

  const getProgressPercentage = () => {
    if (!broadcastStatus) return 0;
    const { total_users, sent_count, failed_count } = broadcastStatus.broadcast;
    return Math.round(((sent_count + failed_count) / total_users) * 100);
  };

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Рассылка сообщений</h1>
        <p className="text-gray-600 mt-2">Отправка сообщений всем пользователям системы</p>
      </div>

      {/* Форма создания рассылки */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Создать рассылку</h2>
        
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label htmlFor="message" className="block text-sm font-medium text-gray-700 mb-2">
              Сообщение
            </label>
            <textarea
              id="message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={4}
              placeholder="Введите сообщение для рассылки..."
              disabled={loading || !!currentBroadcast}
            />
          </div>

          <div className="mb-4">
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={includeUsersWithoutTelegram}
                onChange={(e) => setIncludeUsersWithoutTelegram(e.target.checked)}
                className="mr-2"
                disabled={loading || !!currentBroadcast}
              />
              <span className="text-sm text-gray-700">
                Включить пользователей без Telegram ID
              </span>
            </label>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
              <AlertCircle className="inline w-4 h-4 mr-2" />
              {error}
            </div>
          )}

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={loading || !message.trim() || !!currentBroadcast}
              className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Send className="w-4 h-4 mr-2" />
              {loading ? 'Создание...' : 'Создать рассылку'}
            </button>

            {currentBroadcast && currentBroadcast.status === 'pending' && (
              <button
                type="button"
                onClick={handleCancel}
                className="flex items-center px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
              >
                <X className="w-4 h-4 mr-2" />
                Отменить
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Статус текущей рассылки */}
      {currentBroadcast && (
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Статус рассылки</h2>
            <div className="flex items-center space-x-4">
              <div className="flex items-center">
                {getStatusIcon(currentBroadcast.status)}
                <span className="ml-2 text-sm font-medium capitalize">
                  {currentBroadcast.status.replace('_', ' ')}
                </span>
              </div>
              {(currentBroadcast.status === 'completed' || currentBroadcast.status === 'failed') && (
                <button
                  onClick={() => {
                    setCurrentBroadcast(null);
                    setBroadcastStatus(null);
                  }}
                  className="flex items-center px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
                >
                  <X className="w-4 h-4 mr-2" />
                  Закрыть
                </button>
              )}
            </div>
          </div>

          <div className="mb-4">
            <div className="flex justify-between text-sm text-gray-600 mb-1">
              <span>ID рассылки: {currentBroadcast.broadcast_id}</span>
              <span>{getProgressPercentage()}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${getProgressPercentage()}%` }}
              ></div>
            </div>
          </div>

          {broadcastStatus && (
            <div className="grid grid-cols-4 gap-4 text-center">
              <div className="bg-blue-50 p-3 rounded">
                <div className="text-2xl font-bold text-blue-600">{broadcastStatus.broadcast.total_users}</div>
                <div className="text-sm text-gray-600">Всего</div>
              </div>
              <div className="bg-green-50 p-3 rounded">
                <div className="text-2xl font-bold text-green-600">{broadcastStatus.broadcast.sent_count}</div>
                <div className="text-sm text-gray-600">Отправлено</div>
              </div>
              <div className="bg-red-50 p-3 rounded">
                <div className="text-2xl font-bold text-red-600">{broadcastStatus.broadcast.failed_count}</div>
                <div className="text-sm text-gray-600">Ошибки</div>
              </div>
              <div className="bg-yellow-50 p-3 rounded">
                <div className="text-2xl font-bold text-yellow-600">{broadcastStatus.broadcast.pending_count}</div>
                <div className="text-sm text-gray-600">Ожидает</div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Детальная статистика сообщений */}
      {broadcastStatus && broadcastStatus.messages.length > 0 && (
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold mb-4">Детальная статистика</h2>
          
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Пользователь
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Telegram ID
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Статус
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Попытки
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Действия
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {broadcastStatus.messages.map((msg) => (
                  <tr key={msg.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {msg.user_id}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {msg.telegram_id || 'Нет'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        {getMessageStatusIcon(msg.status)}
                        <span className="ml-2 text-sm capitalize">
                          {msg.status}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {msg.retry_count}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      {msg.status === 'failed' && (
                        <button
                          onClick={() => handleRetry(msg.user_id)}
                          className="text-blue-600 hover:text-blue-900"
                        >
                          Повторить
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* История рассылок */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">История рассылок</h2>
          <button
            onClick={loadBroadcastHistory}
            disabled={historyLoading}
            className="flex items-center px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${historyLoading ? 'animate-spin' : ''}`} />
            Обновить
          </button>
        </div>

        {historyLoading ? (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-2 text-gray-600">Загрузка истории...</p>
          </div>
        ) : broadcastHistory.length === 0 ? (
          <div className="text-center py-8">
            <MessageCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600">История рассылок пуста</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Дата
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Сообщение
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Статус
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Статистика
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Действия
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {broadcastHistory.map((broadcast) => (
                  <tr key={broadcast.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {new Date(broadcast.created_at).toLocaleString('ru-RU')}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 max-w-xs truncate">
                      {broadcast.message}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        {getBroadcastStatusIcon(broadcast.status)}
                        <span className="ml-2 text-sm capitalize">
                          {broadcast.status}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <div className="flex space-x-2">
                        <span className="text-green-600">{broadcast.sent_count} ✓</span>
                        <span className="text-red-600">{broadcast.failed_count} ✗</span>
                        <span className="text-yellow-600">{broadcast.pending_count} ⏳</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <button
                        onClick={() => handleViewDetails(broadcast.id)}
                        className="text-blue-600 hover:text-blue-900"
                      >
                        Детали
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default Broadcast;
