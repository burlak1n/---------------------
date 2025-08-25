import React, { useState, useEffect } from 'react';
import { Calendar, MapPin, Users, Trophy, Clock } from 'lucide-react';
import { slotsApi } from '../api';
import type { Slot } from '../types';
import { formatTime } from '../utils/timeUtils';
import { ru } from 'date-fns/locale';

interface TopSlotsProps {
  refreshTrigger?: number; // Триггер для обновления
}

const TopSlots: React.FC<TopSlotsProps> = ({ refreshTrigger }) => {
  const [topSlots, setTopSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAlgorithmInfo, setShowAlgorithmInfo] = useState(false);

  useEffect(() => {
    loadTopSlots();
  }, [refreshTrigger]); // Обновляем при изменении триггера

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
        <div className="flex items-center justify-center py-6">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
          <span className="ml-2 text-blue-600">Загрузка топ-6 слотов...</span>
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
          🏆 Топ-6 лучших слотов для записи
        </h2>
        <button
          onClick={() => setShowAlgorithmInfo(!showAlgorithmInfo)}
          className="ml-auto text-blue-600 hover:text-blue-800 text-sm underline"
        >
          {showAlgorithmInfo ? 'Скрыть' : 'Алгоритм'}
        </button>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {topSlots.slice(0, 6).map((slot, index) => {
          const bookedCount = slot.booked_count || 0;
          const freeSlots = slot.max_user - bookedCount;
          const loadPercentage = (bookedCount / slot.max_user) * 100;
          
          // Определяем цвет и иконку для каждого места
          const getPlaceInfo = (index: number) => {
            switch (index) {
              case 0: return { color: 'border-l-yellow-500', bg: 'bg-yellow-100', text: 'text-yellow-800', icon: '🥇', place: '1-е место' };
              case 1: return { color: 'border-l-gray-400', bg: 'bg-gray-100', text: 'text-gray-800', icon: '🥈', place: '2-е место' };
              case 2: return { color: 'border-l-orange-500', bg: 'bg-orange-100', text: 'text-orange-800', icon: '🥉', place: '3-е место' };
              case 3: return { color: 'border-l-blue-500', bg: 'bg-blue-100', text: 'text-blue-800', icon: '4️⃣', place: '4-е место' };
              case 4: return { color: 'border-l-green-500', bg: 'bg-green-100', text: 'text-green-800', icon: '5️⃣', place: '5-е место' };
              case 5: return { color: 'border-l-purple-500', bg: 'bg-purple-100', text: 'text-purple-800', icon: '6️⃣', place: '6-е место' };
              default: return { color: 'border-l-gray-300', bg: 'bg-gray-100', text: 'text-gray-800', icon: '📅', place: `${index + 1}-е место` };
            }
          };
          
          const placeInfo = getPlaceInfo(index);
          
          return (
            <div
              key={slot.id}
              className={`bg-white rounded-lg p-4 shadow-sm border-l-4 ${placeInfo.color} hover:shadow-md transition-shadow duration-200`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${placeInfo.bg} ${placeInfo.text}`}>
                  {placeInfo.icon} {placeInfo.place}
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
                    <span>{loadPercentage.toFixed(0)}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-1.5">
                    <div
                      className={`h-1.5 rounded-full ${
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

      {showAlgorithmInfo && (
        <div className="mt-4 p-3 bg-blue-100 rounded-lg">
          <div className="text-sm text-blue-800">
            <p className="font-medium mb-2">Алгоритм выбора:</p>
            <ul className="list-disc list-inside space-y-1 text-xs">
              <li><strong>50%</strong> - свободные места</li>
              <li><strong>50%</strong> - временная близость</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
};

export default TopSlots;
