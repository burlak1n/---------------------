import React, { useEffect, useState } from 'react';
import { Calendar, User, Clock, Trash2 } from 'lucide-react';
import { bookingsApi, usersApi, slotsApi } from '../api';
import type { BookingRecord, User as UserType, Slot } from '../types';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { formatTime } from '../utils/timeUtils';

interface BookingWithDetails extends BookingRecord {
  user?: UserType;
  slot?: Slot;
}

const Bookings: React.FC = () => {
  const [bookings, setBookings] = useState<BookingWithDetails[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchBookings();
  }, []);

  const fetchBookings = async () => {
    try {
      const [bookingsData, usersData, slotsData] = await Promise.all([
        bookingsApi.getAll(),
        usersApi.getAll(),
        slotsApi.getAll(),
      ]);

      // Объединяем данные
      const bookingsWithDetails = bookingsData.map((booking) => {
        const user = usersData.find((u) => u.id === booking.user_id);
        const slot = booking.slot_id ? slotsData.find((s) => s.id === booking.slot_id) : undefined;
        
        return {
          ...booking,
          user,
          slot,
        };
      });

      setBookings(bookingsWithDetails);
    } catch (error) {
      console.error('Error fetching bookings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteBooking = async (bookingId: number) => {
    if (!confirm('Вы уверены, что хотите удалить это бронирование?')) return;
    
    try {
      await bookingsApi.delete(bookingId);
      fetchBookings();
    } catch (error) {
      console.error('Error deleting booking:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Загрузка...</div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Бронирования</h1>
        <p className="text-gray-600">Просмотр всех бронирований собеседований</p>
      </div>

      {/* Bookings List */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-medium text-gray-900">Список бронирований</h2>
        </div>
        <div className="divide-y divide-gray-200">
          {bookings.length === 0 ? (
            <div className="px-6 py-8 text-center text-gray-500">
              Нет бронирований
            </div>
          ) : (
            bookings
              .sort((a, b) => {
                // Сортируем по времени слота (от ближайшего), если слот есть
                if (a.slot && b.slot) {
                  return new Date(a.slot.time).getTime() - new Date(b.slot.time).getTime();
                }
                // Если у одного из бронирований нет слота, помещаем его в конец
                if (!a.slot) return 1;
                if (!b.slot) return -1;
                return 0;
              })
              .map((booking) => (
              <div key={booking.id} className="px-6 py-4 hover:bg-gray-50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-6">
                    <div className="flex items-center text-gray-900">
                      <User className="h-5 w-5 mr-2" />
                      <span className="font-medium">
                        {booking.user?.name || `Пользователь ${booking.user_id}`}
                      </span>
                    </div>
                    
                    {booking.slot && (
                      <>
                        <div className="flex items-center text-gray-600">
                          <Calendar className="h-5 w-5 mr-2" />
                          <span>
                            {formatTime(booking.slot.time, 'dd MMMM yyyy, HH:mm', ru)}
                          </span>
                        </div>
                        <div className="flex items-center text-gray-600">
                          <span className="mr-2">📍</span>
                          <span>{booking.slot.place}</span>
                        </div>
                      </>
                    )}
                    
                    {booking.created_at && (
                      <div className="flex items-center text-gray-500">
                        <Clock className="h-4 w-4 mr-2" />
                        <span className="text-sm">
                          Создано: {formatTime(booking.created_at, 'dd.MM.yyyy HH:mm', ru)}
                        </span>
                      </div>
                    )}
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                      ID: {booking.id}
                    </span>
                    {booking.slot ? (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        Подтверждено
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                        Ожидает
                      </span>
                    )}
                    <button
                      onClick={() => handleDeleteBooking(booking.id)}
                      className="p-1 text-red-600 hover:text-red-800 hover:bg-red-50 rounded"
                      title="Удалить"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Statistics */}
      <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
          <div className="flex items-center">
            <div className="p-3 rounded-full bg-blue-500">
              <Calendar className="h-6 w-6 text-white" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Всего бронирований</p>
              <p className="text-2xl font-semibold text-gray-900">{bookings.length}</p>
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
          <div className="flex items-center">
            <div className="p-3 rounded-full bg-green-500">
              <User className="h-6 w-6 text-white" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Подтверждено</p>
              <p className="text-2xl font-semibold text-gray-900">
                {bookings.filter(b => b.slot).length}
              </p>
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
          <div className="flex items-center">
            <div className="p-3 rounded-full bg-yellow-500">
              <Clock className="h-6 w-6 text-white" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Ожидает</p>
              <p className="text-2xl font-semibold text-gray-900">
                {bookings.filter(b => !b.slot).length}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Bookings;
