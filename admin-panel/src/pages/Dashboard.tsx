import React, { useEffect, useState } from 'react';
import { Calendar, BookOpen, TrendingUp, Megaphone } from 'lucide-react';
import { slotsApi, bookingsApi } from '../api';
import type { Slot, BookingRecord } from '../types';
import TopSlots from '../components/TopSlots';

const Dashboard: React.FC = () => {
  const [stats, setStats] = useState({
    slots: 0,
    bookings: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const [slots, bookings] = await Promise.all([
          slotsApi.getAll(),
          bookingsApi.getAll(),
        ]);

        setStats({
          slots: slots.length,
          bookings: bookings.length,
        });
      } catch (error) {
        console.error('Error fetching stats:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  const statCards = [
    {
      title: 'Всего слотов',
      value: stats.slots,
      icon: Calendar,
      color: 'bg-blue-500',
    },
    {
      title: 'Бронирования',
      value: stats.bookings,
      icon: BookOpen,
      color: 'bg-purple-500',
    },
  ];

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
        <h1 className="text-2xl font-bold text-gray-900">Панель управления</h1>
        <p className="text-gray-600">Обзор системы бронирования собеседований</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {statCards.map((stat) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.title}
              className="bg-white rounded-lg shadow p-6 border border-gray-200"
            >
              <div className="flex items-center">
                <div className={`p-3 rounded-full ${stat.color}`}>
                  <Icon className="h-6 w-6 text-white" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">
                    {stat.title}
                  </p>
                  <p className="text-2xl font-semibold text-gray-900">
                    {stat.value}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Top Slots */}
      <TopSlots />

      {/* Quick Actions */}
      <div className="bg-white rounded-lg shadow border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-medium text-gray-900">Быстрые действия</h2>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <button className="flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">
              <Calendar className="mr-2 h-4 w-4" />
              Создать новый слот
            </button>

            <button className="flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500">
              <Megaphone className="mr-2 h-4 w-4" />
              Отправить рассылку
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
