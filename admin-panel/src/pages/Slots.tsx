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
  }, []);

  const fetchSlots = async () => {
    try {
      const data = await slotsApi.getAll();
      setSlots(data);
    } catch (error) {
      console.error('Error fetching slots:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateSlot = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await slotsApi.create(newSlot);
      setNewSlot({ start_time: '', place: '', max_users: 1 });
      setShowCreateForm(false);
      fetchSlots();
    } catch (error) {
      console.error('Error creating slot:', error);
    }
  };

  const handleEditSlot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSlot) return;
    
    try {
      await slotsApi.update(editingSlot.id, editSlot);
      setEditSlot({ start_time: '', place: '', max_users: 1 });
      setShowEditForm(false);
      setEditingSlot(null);
      fetchSlots();
    } catch (error) {
      console.error('Error updating slot:', error);
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
    setEditingSlot(slot);
    setEditSlot({
      start_time: slot.time,
      place: slot.place,
      max_users: slot.max_user,
    });
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
          <h2 className="text-lg font-medium text-gray-900">Доступные слоты</h2>
        </div>
        <div className="divide-y divide-gray-200">
          {slots.length === 0 ? (
            <div className="px-6 py-8 text-center text-gray-500">
              Нет доступных слотов
            </div>
          ) : (
            slots.map((slot) => (
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
                      <span>Макс: {slot.max_user}</span>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                      Активен
                    </span>
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
