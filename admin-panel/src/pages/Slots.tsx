import React, { useEffect, useState } from 'react';
import { Plus, Calendar, MapPin, Users, Edit, Trash2 } from 'lucide-react';
import { slotsApi } from '../api';
import type { Slot, CreateSlotRequest, UpdateSlotRequest } from '../types';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';

const Slots: React.FC = () => {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [editingSlot, setEditingSlot] = useState<Slot | null>(null);
  const [showAvailableOnly, setShowAvailableOnly] = useState(true);
  const [newSlot, setNewSlot] = useState<CreateSlotRequest>({
    start_time: '',
    place: '',
    max_users: 1,
  });
  const [editSlot, setEditSlot] = useState<UpdateSlotRequest>({
    start_time: '',
    place: '',
    max_users: 1,
  });

  useEffect(() => {
    fetchSlots();
  }, [showAvailableOnly]);

  const fetchSlots = async () => {
    try {
      const data = showAvailableOnly 
        ? await slotsApi.getAll()
        : await slotsApi.getAllSlots();
      setSlots(data);
    } catch (error) {
      console.error('Error fetching slots:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateSlot = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Валидация даты
    if (!newSlot.start_time) {
      alert('Пожалуйста, выберите дату и время');
      return;
    }
    
    try {
      // Преобразуем строку даты в ISO формат
      const dateTime = new Date(newSlot.start_time);
      if (isNaN(dateTime.getTime())) {
        alert('Некорректный формат даты');
        return;
      }
      
      const slotData = {
        ...newSlot,
        start_time: dateTime.toISOString()
      };
      
      await slotsApi.create(slotData);
      setNewSlot({ start_time: '', place: '', max_users: 1 });
      setShowCreateForm(false);
      fetchSlots();
    } catch (error: any) {
      console.error('Error creating slot:', error);
      alert(`Ошибка при создании слота: ${error.message}`);
    }
  };

  const handleEditSlot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSlot) return;
    
    // Проверяем что хотя бы одно поле изменено
    const hasChanges = 
      (editSlot.start_time && new Date(editSlot.start_time).getTime() !== new Date(editingSlot.time).getTime()) ||
      (editSlot.place && editSlot.place !== editingSlot.place) ||
      (editSlot.max_users && editSlot.max_users !== editingSlot.max_user);
    
    console.log('Проверка изменений:', {
      start_time: {
        new: editSlot.start_time,
        old: editingSlot.time,
        changed: editSlot.start_time && new Date(editSlot.start_time).getTime() !== new Date(editingSlot.time).getTime()
      },
      place: {
        new: editSlot.place,
        old: editingSlot.place,
        changed: editSlot.place && editSlot.place !== editingSlot.place
      },
      max_users: {
        new: editSlot.max_users,
        old: editingSlot.max_user,
        changed: editSlot.max_users && editSlot.max_users !== editingSlot.max_user
      },
      hasChanges
    });
    
    if (!hasChanges) {
      alert('Нет изменений для сохранения');
      return;
    }
    
    // Валидация даты
    if (editSlot.start_time && isNaN(new Date(editSlot.start_time).getTime())) {
      alert('Некорректный формат даты');
      return;
    }
    
    // Валидация максимального количества участников
    if (editSlot.max_users && editSlot.max_users < (editingSlot.booked_count || 0)) {
      alert(`Нельзя установить максимальное количество участников меньше ${editingSlot.booked_count || 0} (уже записано)`);
      return;
    }
    
    try {
      // Преобразуем строку даты в ISO формат если она есть
      const slotData = {
        ...editSlot,
        start_time: editSlot.start_time ? new Date(editSlot.start_time).toISOString() : undefined
      };
      
      console.log('Отправляем данные для обновления:', slotData);
      
      await slotsApi.update(editingSlot.id, slotData);
      
      console.log('Слот успешно обновлен, обновляем список...');
      
      // Обновляем локальное состояние
      setSlots(prevSlots => 
        prevSlots.map(slot => 
          slot.id === editingSlot.id 
            ? { ...slot, ...slotData, max_user: slotData.max_users || slot.max_user }
            : slot
        )
      );
      
      setEditSlot({ start_time: '', place: '', max_users: 1 });
      setShowEditForm(false);
      setEditingSlot(null);
      // fetchSlots(); // Убираем, так как обновляем локально
    } catch (error: any) {
      console.error('Error updating slot:', error);
      alert(`Ошибка при обновлении слота: ${error.message}`);
    }
  };

  const handleDeleteSlot = async (slotId: number) => {
    if (!confirm('Вы уверены, что хотите удалить этот слот?')) return;
    
    try {
      await slotsApi.delete(slotId);
      fetchSlots();
    } catch (error) {
      console.error('Error deleting slot:', error);
    }
  };

  const openEditForm = (slot: Slot) => {
    console.log('Открываем форму редактирования для слота:', slot);
    
    setEditingSlot(slot);
    
    // Преобразуем ISO дату в формат datetime-local
    const date = new Date(slot.time);
    const localDateTime = date.toISOString().slice(0, 16);
    
    const initialEditData = {
      start_time: localDateTime,
      place: slot.place,
      max_users: slot.max_user,
    };
    
    console.log('Инициализируем форму данными:', initialEditData);
    
    setEditSlot(initialEditData);
    setShowEditForm(true);
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
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Управление слотами</h1>
          <p className="text-gray-600">Создание и управление временными слотами для собеседований</p>
        </div>
        <button
          onClick={() => setShowCreateForm(true)}
          className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <Plus className="mr-2 h-4 w-4" />
          Создать слот
        </button>
      </div>

      {/* Toggle Switch */}
      <div className="mb-6">
        <div className="flex items-center space-x-4">
          <span className="text-sm font-medium text-gray-700">Показать:</span>
          <div className="flex bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setShowAvailableOnly(true)}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                showAvailableOnly
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Доступные слоты
            </button>
            <button
              onClick={() => setShowAvailableOnly(false)}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                !showAvailableOnly
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Все слоты
            </button>
          </div>
        </div>
      </div>

      {/* Create Slot Modal */}
      {showCreateForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold mb-4">Создать новый слот</h2>
            <form onSubmit={handleCreateSlot}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Дата и время
                </label>
                <input
                  type="datetime-local"
                  value={newSlot.start_time}
                  onChange={(e) => setNewSlot({ ...newSlot, start_time: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                  min={new Date().toISOString().slice(0, 16)}
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Место проведения
                </label>
                <input
                  type="text"
                  value={newSlot.place}
                  onChange={(e) => setNewSlot({ ...newSlot, place: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Например: Офис на Тверской"
                  required
                />
              </div>
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Максимальное количество участников
                </label>
                <input
                  type="number"
                  min="1"
                  value={newSlot.max_users}
                  onChange={(e) => setNewSlot({ ...newSlot, max_users: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
              <div className="flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowCreateForm(false)}
                  className="px-4 py-2 text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                  Создать
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Slot Modal */}
      {showEditForm && editingSlot && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold mb-4">Редактировать слот</h2>
            {editingSlot && (
              <div className="mb-4 p-3 bg-gray-50 rounded text-sm text-gray-600">
                <div>ID: {editingSlot.id}</div>
                <div>Текущее время: {editingSlot.time}</div>
                <div>Текущее место: {editingSlot.place}</div>
                <div>Текущий максимум: {editingSlot.max_user}</div>
                <div>Записано: {editingSlot.booked_count || 0}</div>
              </div>
            )}
            <form onSubmit={handleEditSlot}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Дата и время
                </label>
                <input
                  type="datetime-local"
                  value={editSlot.start_time || ''}
                  onChange={(e) => setEditSlot({ ...editSlot, start_time: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Место проведения
                </label>
                <input
                  type="text"
                  value={editSlot.place || ''}
                  onChange={(e) => setEditSlot({ ...editSlot, place: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Например: Офис на Тверской"
                />
              </div>
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Максимальное количество участников
                </label>
                <input
                  type="number"
                  min="1"
                  value={editSlot.max_users || 1}
                  onChange={(e) => setEditSlot({ ...editSlot, max_users: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {editingSlot && (
                  <p className="mt-1 text-sm text-gray-500">
                    Текущее количество записанных: {editingSlot.booked_count || 0}
                  </p>
                )}
                {editingSlot && editSlot.max_users && (editSlot.max_users < (editingSlot.booked_count || 0)) && (
                  <p className="mt-1 text-sm text-red-500">
                    ⚠️ Нельзя установить меньше {editingSlot.booked_count || 0} (уже записано)
                  </p>
                )}
              </div>
              <div className="flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowEditForm(false);
                    setEditingSlot(null);
                  }}
                  className="px-4 py-2 text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                  Сохранить
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Slots List */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-medium text-gray-900">
            {showAvailableOnly ? 'Доступные слоты' : 'Все слоты'}
          </h2>
          {slots.length > 0 && (
            <div className="mt-2 text-sm text-gray-600">
              Всего слотов: {slots.length} | 
              Заполнено: {slots.filter(s => (s.booked_count || 0) >= s.max_user).length} | 
              Доступно: {slots.filter(s => (s.booked_count || 0) < s.max_user).length}
            </div>
          )}
        </div>
        <div className="divide-y divide-gray-200">
          {slots.length === 0 ? (
            <div className="px-6 py-8 text-center text-gray-500">
              {showAvailableOnly ? 'Нет доступных слотов' : 'Слотов не найдено'}
            </div>
          ) : (
            slots
              .sort((a, b) => {
                const aRatio = (a.booked_count || 0) / a.max_user;
                const bRatio = (b.booked_count || 0) / b.max_user;
                return bRatio - aRatio; // Сначала более заполненные
              })
              .map((slot) => (
              <div key={slot.id} className="px-6 py-4 hover:bg-gray-50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <div className="flex items-center text-gray-600">
                      <Calendar className="h-5 w-5 mr-2" />
                      <span className="font-medium">
                        {format(new Date(slot.time), 'dd MMMM yyyy, HH:mm', { locale: ru })}
                      </span>
                    </div>
                    <div className="flex items-center text-gray-600">
                      <MapPin className="h-5 w-5 mr-2" />
                      <span>{slot.place}</span>
                    </div>
                    <div className="flex items-center text-gray-600">
                      <Users className="h-5 w-5 mr-2" />
                      <span 
                        className={`font-medium cursor-help ${
                          (slot.booked_count || 0) >= slot.max_user 
                            ? 'text-red-600' 
                            : (slot.booked_count || 0) >= slot.max_user * 0.8 
                              ? 'text-yellow-600' 
                              : 'text-green-600'
                        }`}
                        title={`Записано: ${slot.booked_count || 0}, Максимум: ${slot.max_user}, Свободно: ${slot.max_user - (slot.booked_count || 0)}`}
                      >
                        {slot.booked_count || 0}/{slot.max_user}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    {!showAvailableOnly && (
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        slot.max_user > (slot.booked_count || 0)
                          ? 'bg-green-100 text-green-800'
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {slot.max_user > (slot.booked_count || 0) 
                          ? `Доступен (${slot.max_user - (slot.booked_count || 0)} мест)` 
                          : 'Заполнен'}
                      </span>
                    )}
                    {showAvailableOnly && (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        Активен
                      </span>
                    )}
                    <button
                      onClick={() => openEditForm(slot)}
                      className="p-1 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded"
                      title="Редактировать"
                    >
                      <Edit className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteSlot(slot.id)}
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
    </div>
  );
};

export default Slots;
