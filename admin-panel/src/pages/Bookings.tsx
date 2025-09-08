import React, { useEffect, useState } from 'react';
import { Calendar, User, Clock, Trash2, Plus } from 'lucide-react';
import { bookingsApi, slotsApi } from '../api';
import type { BookingRecord, Slot, CreateBookingRequest, Booking } from '../types';
import { ru } from 'date-fns/locale';
import { formatTime } from '../utils/timeUtils';

interface BookingWithDetails extends BookingRecord {
  slot?: Slot;
}

const Bookings: React.FC = () => {
  const [bookings, setBookings] = useState<BookingWithDetails[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSlotId, setSelectedSlotId] = useState<number | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createForm, setCreateForm] = useState({
    slot_id: '',
    telegram_id: ''
  });
  const [createLoading, setCreateLoading] = useState(false);

  useEffect(() => {
    fetchBookings();
  }, []);

  const fetchBookings = async () => {
    try {
      const [bookingsData, slotsData] = await Promise.all([
        bookingsApi.getAll(),
        slotsApi.getAll(),
      ]);

      // Объединяем данные
      const bookingsWithDetails = bookingsData.map((booking) => {
        const slot = booking.slot_id ? slotsData.find((s) => s.id === booking.slot_id) : undefined;
        
        return {
          ...booking,
          slot,
        };
      });

      setBookings(bookingsWithDetails);
      setSlots(slotsData);
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

  const handleCreateBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!createForm.slot_id || !createForm.telegram_id) {
      alert('Пожалуйста, заполните все поля');
      return;
    }

    setCreateLoading(true);
    try {
      const bookingData: CreateBookingRequest = {
        slot_id: createForm.slot_id,
        telegram_id: parseInt(createForm.telegram_id)
      };
      
      const createdBooking: Booking = await bookingsApi.create(bookingData);
      console.log('Бронирование создано:', createdBooking);
      setCreateForm({ slot_id: '', telegram_id: '' });
      setShowCreateForm(false);
      fetchBookings();
    } catch (error: any) {
      console.error('Error creating booking:', error);
      alert(error.message || 'Ошибка при создании бронирования');
    } finally {
      setCreateLoading(false);
    }
  };

  const filteredBookings = selectedSlotId 
    ? bookings.filter(booking => booking.slot_id === selectedSlotId)
    : bookings;

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
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Бронирования</h1>
            <p className="text-gray-600">Просмотр всех бронирований собеседований</p>
          </div>
          <button
            onClick={() => setShowCreateForm(!showCreateForm)}
            className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="h-4 w-4 mr-2" />
            Создать бронирование
          </button>
        </div>
      </div>

      {/* Create Booking Form */}
      {showCreateForm && (
        <div className="mb-6">
          <div className="bg-white shadow rounded-lg p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Создать новое бронирование</h3>
            <form onSubmit={handleCreateBooking} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="slot-select" className="block text-sm font-medium text-gray-700 mb-2">
                    Выберите слот
                  </label>
                  <select
                    id="slot-select"
                    value={createForm.slot_id}
                    onChange={(e) => setCreateForm({ ...createForm, slot_id: e.target.value })}
                    className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    required
                  >
                    <option value="">Выберите слот</option>
                    {slots
                      .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime())
                      .map((slot) => (
                        <option key={slot.id} value={slot.id}>
                          {formatTime(slot.time, 'dd.MM.yyyy HH:mm', ru)} - {slot.place}
                        </option>
                      ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="telegram-id" className="block text-sm font-medium text-gray-700 mb-2">
                    Telegram ID пользователя
                  </label>
                  <input
                    type="number"
                    id="telegram-id"
                    value={createForm.telegram_id}
                    onChange={(e) => setCreateForm({ ...createForm, telegram_id: e.target.value })}
                    className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Введите Telegram ID"
                    required
                  />
                </div>
              </div>
              <div className="flex items-center space-x-3">
                <button
                  type="submit"
                  disabled={createLoading}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {createLoading ? 'Создание...' : 'Создать бронирование'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateForm(false);
                    setCreateForm({ slot_id: '', telegram_id: '' });
                  }}
                  className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 transition-colors"
                >
                  Отмена
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Filter by Slot */}
      <div className="mb-6">
        <div className="bg-white shadow rounded-lg p-4">
          <div className="flex items-center space-x-4">
            <label htmlFor="slot-filter" className="text-sm font-medium text-gray-700">
              Фильтр по слотам:
            </label>
            <select
              id="slot-filter"
              value={selectedSlotId || ''}
              onChange={(e) => setSelectedSlotId(e.target.value ? Number(e.target.value) : null)}
              className="block w-64 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Все слоты</option>
              {slots
                .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime())
                .map((slot) => (
                  <option key={slot.id} value={slot.id}>
                    {formatTime(slot.time, 'dd.MM.yyyy HH:mm', ru)} - {slot.place}
                  </option>
                ))}
            </select>
            {selectedSlotId && (
              <button
                onClick={() => setSelectedSlotId(null)}
                className="px-3 py-2 text-sm text-gray-600 hover:text-gray-800"
              >
                Очистить фильтр
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Bookings List */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-medium text-gray-900">Список бронирований</h2>
        </div>
        <div className="divide-y divide-gray-200">
          {filteredBookings.length === 0 ? (
            <div className="px-6 py-8 text-center text-gray-500">
              {selectedSlotId ? 'Нет бронирований для выбранного слота' : 'Нет бронирований'}
            </div>
          ) : (
            filteredBookings
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
                        {`Пользователь ${booking.telegram_id}`}
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
              <p className="text-2xl font-semibold text-gray-900">{filteredBookings.length}</p>
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
                {filteredBookings.filter(b => b.slot).length}
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
                {filteredBookings.filter(b => !b.slot).length}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Bookings;
