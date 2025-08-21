import React, { useState, useEffect } from 'react';
import { Calendar, MapPin, Users, Trophy, Clock } from 'lucide-react';
import { slotsApi } from '../api';
import type { Slot } from '../types';
import { formatTime } from '../utils/timeUtils';
import { ru } from 'date-fns/locale';

const TopSlots: React.FC = () => {
  const [topSlots, setTopSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadTopSlots();
  }, []);

  const loadTopSlots = async () => {
    try {
      setLoading(true);
      const slots = await slotsApi.getBest();
      setTopSlots(slots);
      setError(null);
    } catch (err) {
      console.error('Failed to load top slots:', err);
      setError('Не удалось загрузить лучшие слоты');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg shadow-md p-6 mb-6">
        <div className="flex items-center justify-center">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
          <span className="ml-2 text-blue-600">Загрузка лучших слотов...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
        <div className="flex items-center text-red-800">
          <span className="text-sm">{error}</span>
          <button
            onClick={loadTopSlots}
            className="ml-2 text-red-600 hover:text-red-800 underline"
          >
            Попробовать снова
          </button>
        </div>
      </div>
    );
  }

  if (topSlots.length === 0) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
        <div className="flex items-center text-yellow-800">
          <Clock className="h-5 w-5 mr-2" />
          <span className="text-sm">Нет доступных слотов для отображения</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg shadow-md p-6 mb-6">
      <div className="flex items-center mb-4">
        <Trophy className="h-6 w-6 text-yellow-600 mr-2" />
        <h2 className="text-lg font-semibold text-gray-900">
          🏆 Топ-3 лучших слота для записи
        </h2>
        <button
          onClick={loadTopSlots}
          className="ml-auto text-blue-600 hover:text-blue-800 text-sm underline"
        >
          Обновить
        </button>
      </div>
      
      <p className="text-sm text-gray-600 mb-4">
        Слоты отсортированы по алгоритму: 40% свободные места + 60% временная близость
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {topSlots.map((slot, index) => {
          const bookedCount = slot.booked_count || 0;
          const freeSlots = slot.max_user - bookedCount;
          const loadPercentage = (bookedCount / slot.max_user) * 100;
          
          return (
            <div
              key={slot.id}
              className={`bg-white rounded-lg p-4 shadow-sm border-l-4 ${
                index === 0 ? 'border-l-yellow-500' : 
                index === 1 ? 'border-l-gray-400' : 'border-l-orange-500'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                  index === 0 ? 'bg-yellow-100 text-yellow-800' :
                  index === 1 ? 'bg-gray-100 text-gray-800' :
                  'bg-orange-100 text-orange-800'
                }`}>
                  {index === 0 ? '🥇 1-е место' :
                   index === 1 ? '🥈 2-е место' : '🥉 3-е место'}
                </span>
                <span className="text-xs text-gray-500">
                  ID: {slot.id}
                </span>
              </div>

              <div className="space-y-2">
                <div className="flex items-center text-gray-700">
                  <Calendar className="h-4 w-4 mr-2 text-blue-600" />
                  <span className="text-sm font-medium">
                    {formatTime(slot.time, 'dd MMMM yyyy, HH:mm', ru)}
                  </span>
                </div>

                <div className="flex items-center text-gray-700">
                  <MapPin className="h-4 w-4 mr-2 text-green-600" />
                  <span className="text-sm">{slot.place}</span>
                </div>

                <div className="flex items-center text-gray-700">
                  <Users className="h-4 w-4 mr-2 text-purple-600" />
                  <span className="text-sm">
                    {bookedCount}/{slot.max_user} записано
                  </span>
                </div>

                <div className="pt-2">
                  <div className="flex justify-between text-xs text-gray-600 mb-1">
                    <span>Свободно: {freeSlots}</span>
                    <span>{loadPercentage.toFixed(0)}% заполнено</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full ${
                        loadPercentage < 50 ? 'bg-green-500' :
                        loadPercentage < 80 ? 'bg-yellow-500' : 'bg-red-500'
                      }`}
                      style={{ width: `${loadPercentage}%` }}
                    ></div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 p-3 bg-blue-100 rounded-lg">
        <div className="flex items-start">
          <div className="text-blue-600 mr-2 mt-0.5">ℹ️</div>
          <div className="text-sm text-blue-800">
            <p className="font-medium mb-1">Как работает алгоритм выбора:</p>
            <ul className="list-disc list-inside space-y-1 text-xs">
              <li><strong>40% веса</strong> - количество свободных мест (больше = лучше)</li>
              <li><strong>60% веса</strong> - временная близость (ближе = лучше)</li>
              <li>Слоты автоматически обновляются каждые 5 минут</li>
              <li>Показываются только доступные для записи слоты</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TopSlots;
