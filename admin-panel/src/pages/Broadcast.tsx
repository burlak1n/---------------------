import React, { useState, useEffect } from 'react';
import { Send, Users, MessageCircle, AlertCircle, RefreshCw, X, CheckCircle, Clock, AlertTriangle, Eye, Upload, Image, Video, File, Music, Mic } from 'lucide-react';
import { broadcastApi, externalUsersApi, slotsApi, bookingsApi } from '../api';
import type { 
  CreateBroadcastCommand, 
  BroadcastCreatedResponse, 
  BroadcastStatusResponse,
  BroadcastStatus,
  MessageStatus,
  BroadcastSummary,
  ExternalUser,
  MediaItem,
  Slot,
  BookingRecord
} from '../types';
import UserProfile from '../components/UserProfile';

const Broadcast: React.FC = () => {
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [currentBroadcast, setCurrentBroadcast] = useState<BroadcastCreatedResponse | null>(null);
  const [broadcastStatus, setBroadcastStatus] = useState<BroadcastStatusResponse | null>(null);
  const [broadcastHistory, setBroadcastHistory] = useState<BroadcastSummary[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pollingInterval, setPollingInterval] = useState<number | null>(null);
  
  // Состояние для выбора пользователей
  const [showUserSelection, setShowUserSelection] = useState(false);

  // Состояние для внешних пользователей
  const [externalUsers, setExternalUsers] = useState<ExternalUser[]>([]);
  const [externalUsersLoading, setExternalUsersLoading] = useState(false);
  const [selectedExternalUsers, setSelectedExternalUsers] = useState<string[]>([]);

  // Состояние для выбора по слотам
  const [slots, setSlots] = useState<Slot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedSlotIds, setSelectedSlotIds] = useState<number[]>([]);
  const [useSlotSelection, setUseSlotSelection] = useState(false);
  const [bookings, setBookings] = useState<BookingRecord[]>([]);

  // Состояние для ручного ввода ID
  const [manualUserIds, setManualUserIds] = useState('');
  const [useManualIds, setUseManualIds] = useState(false);

  // Состояние для подтверждения рассылки
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [pendingBroadcast, setPendingBroadcast] = useState<{
    type: 'custom' | 'signup';
    users: string[];
    message: string;
  } | null>(null);

  // Состояние для профиля пользователя
  const [selectedUserProfile, setSelectedUserProfile] = useState<number | null>(null);
  const [isProfileOpen, setIsProfileOpen] = useState(false);

  // Состояние для медиафайлов
  const [mediaFiles, setMediaFiles] = useState<MediaItem[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);

  // Очистка интервала при размонтировании
  useEffect(() => {
    return () => {
      if (pollingInterval) {
        window.clearInterval(pollingInterval);
      }
    };
  }, [pollingInterval]);

  // Polling для обновления статуса
  useEffect(() => {
    // Очищаем предыдущий интервал при изменении currentBroadcast
    if (pollingInterval) {
      window.clearInterval(pollingInterval);
      setPollingInterval(null);
    }

    if (currentBroadcast && currentBroadcast.status !== 'completed' && currentBroadcast.status !== 'failed') {
      const interval = setInterval(async () => {
        try {
          const status = await broadcastApi.getStatus(currentBroadcast.broadcast_id);
          if (status) {
            setBroadcastStatus(status);
            
            // Обновляем currentBroadcast с актуальным статусом
            setCurrentBroadcast(prev => prev ? { ...prev, status: status.broadcast.status } : null);
            
            // Если рассылка завершена, останавливаем polling
            if (status.broadcast.status === 'completed' || status.broadcast.status === 'failed') {
              clearInterval(interval);
              setPollingInterval(null);
              // Обновляем историю после завершения рассылки
              loadBroadcastHistory();
            }
          }
        } catch (err) {
          console.error('Failed to fetch broadcast status:', err);
        }
      }, 2000); // Обновляем каждые 2 секунды

      setPollingInterval(interval as unknown as number);
    }
  }, [currentBroadcast]);

  // Загрузка истории рассылок
  useEffect(() => {
    loadBroadcastHistory();
  }, []);

  // Загрузка пользователей
  useEffect(() => {
    loadUsers();
  }, []);

  // Загрузка слотов и записей
  useEffect(() => {
    loadSlotsAndBookings();
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

  const loadUsers = async () => {
    setExternalUsersLoading(true);
    
    try {
      // Загружаем внешних пользователей
      const externalData = await externalUsersApi.getCompletedUsersCached();
      setExternalUsers(externalData);

      // Сбрасываем выбранных пользователей
      setSelectedExternalUsers([]);
    } catch (err) {
      console.error('Failed to load users:', err);
    } finally {
      setExternalUsersLoading(false);
    }
  };

  const loadSlotsAndBookings = async () => {
    setSlotsLoading(true);
    
    try {
      // Загружаем слоты и записи параллельно
      const [slotsData, bookingsData] = await Promise.all([
        slotsApi.getAllSlots(), // Получаем все слоты, включая занятые
        bookingsApi.getAll()
      ]);
      
      setSlots(slotsData);
      setBookings(bookingsData);
    } catch (err) {
      console.error('Failed to load slots and bookings:', err);
    } finally {
      setSlotsLoading(false);
    }
  };

  // Получение пользователей по выбранным слотам
  const getUsersBySelectedSlots = (): string[] => {
    if (selectedSlotIds.length === 0) return [];
    
    const userIds = bookings
      .filter(booking => selectedSlotIds.includes(booking.slot_id || 0))
      .map(booking => booking.telegram_id.toString());
    
    // Убираем дубликаты
    return [...new Set(userIds)];
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) {
      setError('Введите сообщение для рассылки');
      return;
    }

    setError(null);

    // Определяем список пользователей для рассылки
    let usersForBroadcast: string[] = [];
    
    if (useManualIds && manualUserIds.trim()) {
      // Используем вручную введенные ID
      usersForBroadcast = parseManualUserIds(manualUserIds);
      
      if (usersForBroadcast.length === 0) {
        setError('Не найдено ни одного валидного ID пользователя');
        return;
      }
    } else {
      // Объединяем выбранных пользователей и пользователей из слотов
      const slotUsers = getUsersBySelectedSlots();
      usersForBroadcast = [...new Set([...selectedExternalUsers, ...slotUsers])];
    }
    // Если usersForBroadcast пустой, рассылка будет всем (но это не ручной режим)

    // Показываем диалог подтверждения
    showConfirmationDialog('custom', usersForBroadcast, message.trim());
  };

  const handleSendSignUpMessage = async () => {
    setError(null);

    // Определяем список пользователей для рассылки
    let usersForBroadcast: string[] = [];
    
    if (useManualIds && manualUserIds.trim()) {
      // Используем вручную введенные ID
      usersForBroadcast = parseManualUserIds(manualUserIds);
      
      if (usersForBroadcast.length === 0) {
        setError('Не найдено ни одного валидного ID пользователя');
        return;
      }
    } else {
      // Объединяем выбранных пользователей и пользователей из слотов
      const slotUsers = getUsersBySelectedSlots();
      usersForBroadcast = [...new Set([...selectedExternalUsers, ...slotUsers])];
    }
    // Если usersForBroadcast пустой, рассылка будет всем (но это не ручной режим)

    // Показываем диалог подтверждения
    showConfirmationDialog('signup', usersForBroadcast, "🎉 Поздравляем! Вы успешно прошли анкетирование и можете записаться на собеседование. Нажмите кнопку ниже для записи.");
  };

  const handleCancel = async () => {
    if (!currentBroadcast) return;

    try {
      await broadcastApi.cancel(currentBroadcast.broadcast_id);
      setCurrentBroadcast(null);
      setBroadcastStatus(null);
      if (pollingInterval) {
        window.clearInterval(pollingInterval);
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

  const handleViewProfile = (telegramId: number) => {
    setSelectedUserProfile(telegramId);
    setIsProfileOpen(true);
  };

  const handleCloseProfile = () => {
    setIsProfileOpen(false);
    setSelectedUserProfile(null);
  };

  // Функции для работы с медиафайлами
  const getFileType = (file: File): MediaItem['media_type'] => {
    if (file.type.startsWith('image/')) return 'photo';
    if (file.type.startsWith('video/')) return 'video';
    if (file.type.startsWith('audio/')) return 'audio';
    return 'document';
  };

  const handleFileUpload = async (files: FileList | null) => {
    if (!files) return;
    
    setError('');
    setLoading(true);
    
    try {
      const uploadPromises = Array.from(files).map(async (file) => {
        const formData = new FormData();
        formData.append('file', file);
        
        const response = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        });
        
        if (!response.ok) {
          throw new Error(`Failed to upload ${file.name}`);
        }
        
        const result = await response.json();
        if (!result.success) {
          throw new Error(result.message || `Failed to upload ${file.name}`);
        }
        
        return {
          media_type: getFileType(file),
          file_id: result.file_id,
          file_path: file.name,
          caption: ''
        } as MediaItem;
      });
      
      const newMediaItems = await Promise.all(uploadPromises);
      
      setMediaFiles(prev => {
        const totalFiles = prev.length + newMediaItems.length;
        if (totalFiles > 10) {
          setError(`Максимум 10 файлов в медиагруппе. Вы пытаетесь добавить ${totalFiles} файлов.`);
          return prev;
        }
        setError(null);
        return [...prev, ...newMediaItems];
      });
      
    } catch (err) {
      setError(`Ошибка загрузки файлов: ${err instanceof Error ? err.message : 'Неизвестная ошибка'}`);
      console.error('Upload error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    handleFileUpload(e.dataTransfer.files);
  };

  const removeMediaFile = (index: number) => {
    setMediaFiles(prev => prev.filter((_, i) => i !== index));
  };

  const updateMediaCaption = (index: number, caption: string) => {
    setMediaFiles(prev => prev.map((item, i) => 
      i === index ? { ...item, caption } : item
    ));
  };

  const getMediaIcon = (type: MediaItem['media_type']) => {
    switch (type) {
      case 'photo': return <Image className="w-4 h-4" />;
      case 'video': return <Video className="w-4 h-4" />;
      case 'audio': return <Music className="w-4 h-4" />;
      case 'voice': return <Mic className="w-4 h-4" />;
      default: return <File className="w-4 h-4" />;
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
            window.clearInterval(pollingInterval);
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

  const handleDeleteBroadcast = async (broadcastId: string) => {
    if (!window.confirm('Вы уверены, что хотите удалить эту рассылку? Это действие нельзя отменить.')) {
      return;
    }

    try {
      await broadcastApi.delete(broadcastId);
      
      // Если удаляем текущую рассылку, очищаем состояние
      if (currentBroadcast && currentBroadcast.broadcast_id === broadcastId) {
        setCurrentBroadcast(null);
        setBroadcastStatus(null);
        if (pollingInterval) {
          window.clearInterval(pollingInterval);
          setPollingInterval(null);
        }
      }
      
      // Обновляем историю
      loadBroadcastHistory();
    } catch (err) {
      setError('Ошибка при удалении рассылки');
      console.error('Delete broadcast error:', err);
    }
  };

  // Функции для работы с выбором пользователей
  const toggleExternalUserSelection = (userId: string) => {
    setSelectedExternalUsers(prev => 
      prev.includes(userId) 
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  };

  const selectAllExternalUsers = () => {
    setSelectedExternalUsers(externalUsers.map(user => user.telegram_id.toString()));
  };

  const selectSelectedUsers = async () => {
    try {
      const selectedUsers = await externalUsersApi.getSelectedUsers();
      setSelectedExternalUsers(selectedUsers.map(user => user.telegram_id.toString()));
    } catch (err) {
      console.error('Failed to load selected users:', err);
      setError('Ошибка при загрузке отобранных пользователей');
    }
  };

  const clearUserSelection = () => {
    setSelectedExternalUsers([]);
  };

  const getSelectedExternalUsersCount = () => selectedExternalUsers.length;
  const getTotalExternalUsersCount = () => externalUsers.length;

  // Функции для работы с ручным вводом ID
  const parseManualUserIds = (input: string): string[] => {
    return input
      .split(/[,\n\s]+/)
      .map(id => id.trim())
      .filter(id => id.length > 0 && /^\d+$/.test(id));
  };

  const getManualUserIdsCount = () => {
    return parseManualUserIds(manualUserIds).length;
  };

  const handleManualIdsChange = (value: string) => {
    setManualUserIds(value);
    // Автоматически выбираем введенные ID
    const parsedIds = parseManualUserIds(value);
    setSelectedExternalUsers(parsedIds);
  };

  // Функция для показа диалога подтверждения
  const showConfirmationDialog = (type: 'custom' | 'signup', users: string[], message: string) => {
    setPendingBroadcast({ type, users, message });
    setShowConfirmDialog(true);
  };

  // Функция для выполнения рассылки после подтверждения
  const executeBroadcast = async () => {
    if (!pendingBroadcast) return;

    setLoading(true);
    setError(null);
    setCurrentBroadcast(null);
    setBroadcastStatus(null);
    setShowConfirmDialog(false);

    try {
      // Если есть медиафайлы, текст сообщения становится подписью к первому файлу
      let processedMediaFiles = mediaFiles;
      if (mediaFiles.length > 0) {
        processedMediaFiles = [...mediaFiles];
        // Добавляем текст сообщения к подписи первого файла
        if (processedMediaFiles[0]) {
          const firstFile = processedMediaFiles[0];
          const messageText = pendingBroadcast.message;
          const existingCaption = firstFile.caption || '';
          
          // Объединяем текст сообщения с существующей подписью
          let combinedCaption = messageText;
          if (existingCaption) {
            combinedCaption += '\n\n' + existingCaption;
          }
          
          processedMediaFiles[0] = {
            ...firstFile,
            caption: combinedCaption
          };
        }
      }

      const command: CreateBroadcastCommand = {
        message: pendingBroadcast.message, // Всегда отправляем реальный текст
        message_type: pendingBroadcast.type,
        selected_external_users: pendingBroadcast.users, // Пользователи уже включают выбранных и из слотов
        media_group: mediaFiles.length > 0 ? { media: processedMediaFiles } : undefined,
      };

      const response = await broadcastApi.create(command);
      setCurrentBroadcast(response);
      setMessage('');
      setMediaFiles([]); // Очищаем медиафайлы после успешной отправки
      // Обновляем историю после создания новой рассылки
      loadBroadcastHistory();
    } catch (err) {
      setError('Ошибка при создании рассылки. Попробуйте позже.');
      console.error('Broadcast error:', err);
    } finally {
      setLoading(false);
      setPendingBroadcast(null);
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
        <p className="text-gray-600 mb-4">Выберите тип рассылки:</p>
        
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

          {/* Загрузка медиафайлов */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Медиафайлы (опционально)
            </label>
            
            {/* Предупреждение об ограничениях */}
            <div className="mb-3 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
              <div className="flex">
                <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5 mr-2" />
                <div className="text-sm text-yellow-800">
                  <p className="font-medium">Ограничения медиагруппы:</p>
                  <ul className="mt-1 list-disc list-inside space-y-1">
                    <li>Максимум 10 файлов в одной группе</li>
                    <li>Текст сообщения станет подписью к первому файлу</li>
                    <li>Дополнительная подпись к первому файлу будет добавлена к тексту сообщения</li>
                    <li>Все файлы будут отправлены как одно сообщение</li>
                  </ul>
                </div>
              </div>
            </div>
            
            {/* Область для drag & drop */}
            <div
              className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
                isDragOver 
                  ? 'border-blue-500 bg-blue-50' 
                  : 'border-gray-300 hover:border-gray-400'
              }`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
              <p className="text-sm text-gray-600 mb-2">
                Перетащите файлы сюда или нажмите для выбора
              </p>
              <input
                type="file"
                multiple
                accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.txt"
                onChange={(e) => handleFileUpload(e.target.files)}
                className="hidden"
                id="media-upload"
                disabled={loading || !!currentBroadcast}
              />
              <label
                htmlFor="media-upload"
                className="inline-flex items-center px-3 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 cursor-pointer disabled:opacity-50"
              >
                <Upload className="w-4 h-4 mr-2" />
                Выбрать файлы
              </label>
            </div>

            {/* Список загруженных файлов */}
            {mediaFiles.length > 0 && (
              <div className="mt-4 space-y-2">
                <h4 className="text-sm font-medium text-gray-700">Загруженные файлы:</h4>
                {mediaFiles.map((file, index) => (
                  <div key={index} className="flex items-center space-x-3 p-3 bg-gray-50 rounded-md">
                    {getMediaIcon(file.media_type)}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {file.file_path}
                      </p>
                      <p className="text-xs text-gray-500 capitalize">
                        {file.media_type}
                      </p>
                    </div>
                    <input
                      type="text"
                      placeholder={index === 0 ? "Дополнительная подпись (к тексту сообщения)" : "Подпись (только к первому файлу)"}
                      value={file.caption || ''}
                      onChange={(e) => updateMediaCaption(index, e.target.value)}
                      className={`flex-1 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 ${
                        index > 0 ? 'bg-gray-100 text-gray-500' : ''
                      }`}
                      disabled={loading || !!currentBroadcast || index > 0}
                    />
                    <button
                      type="button"
                      onClick={() => removeMediaFile(index)}
                      className="p-1 text-red-600 hover:text-red-800 hover:bg-red-50 rounded"
                      disabled={loading || !!currentBroadcast}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Источник пользователей
            </label>
            <div className="space-y-2">
              <label className="flex items-center">
                <input
                  type="radio"
                  value="external"
                  checked={!useManualIds}
                  onChange={() => setUseManualIds(false)}
                  className="mr-2"
                  disabled={loading || !!currentBroadcast}
                />
                <span className="text-sm text-gray-700">
                  Пользователи (с завершенными анкетами)
                </span>
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  value="manual"
                  checked={useManualIds}
                  onChange={() => setUseManualIds(true)}
                  className="mr-2"
                  disabled={loading || !!currentBroadcast}
                />
                <span className="text-sm text-gray-700">
                  Ввести ID вручную
                </span>
              </label>
            </div>
          </div>

          {/* Поле для ручного ввода ID */}
          {useManualIds && (
            <div className="mb-4">
              <label htmlFor="manualUserIds" className="block text-sm font-medium text-gray-700 mb-2">
                ID пользователей
              </label>
              <textarea
                id="manualUserIds"
                value={manualUserIds}
                onChange={(e) => handleManualIdsChange(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={3}
                placeholder="Введите ID пользователей через запятую, пробел или с новой строки:&#10;12345, 67890&#10;11111 22222&#10;33333"
                disabled={loading || !!currentBroadcast}
              />
              <div className="mt-1 text-sm text-gray-500">
                Найдено ID: {getManualUserIdsCount()}
                {getManualUserIdsCount() > 0 && (
                  <span className="ml-2 text-green-600">
                    ✓ {parseManualUserIds(manualUserIds).join(', ')}
                  </span>
                )}
                {getManualUserIdsCount() > 0 && (
                  <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded">
                    <p className="text-sm text-green-800">
                      <strong>🔒 Безопасно:</strong> Рассылка будет отправлена только указанным {getManualUserIdsCount()} пользователям
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ЗАКОММЕНТИРОВАНО: Чекбокс для локальных пользователей без Telegram ID
          {userSource === 'local' || userSource === 'both' ? (
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
                  Включить локальных пользователей без Telegram ID
                </span>
              </label>
            </div>
          ) : null}
          */}

          {/* Выбор пользователей */}
          {!useManualIds && (
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-700">
                  Выбор пользователей для рассылки
                </label>
                <button
                  type="button"
                  onClick={() => setShowUserSelection(!showUserSelection)}
                  className="text-sm text-blue-600 hover:text-blue-800"
                  disabled={loading || !!currentBroadcast}
                >
                  {showUserSelection ? 'Скрыть' : 'Показать'} выбор
                </button>
              </div>
            
            {showUserSelection && (
              <div className="border border-gray-300 rounded-md p-4 bg-gray-50">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm text-gray-600">
                    Выбрано: {getSelectedExternalUsersCount()} из {getTotalExternalUsersCount()} пользователей
                  </span>
                  <div className="space-x-2">
                    <button
                      type="button"
                      onClick={() => { selectAllExternalUsers(); }}
                      className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                      disabled={externalUsersLoading}
                    >
                      Выбрать всех
                    </button>
                    <button
                      type="button"
                      onClick={selectSelectedUsers}
                      className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded hover:bg-green-200"
                      disabled={externalUsersLoading}
                    >
                      Выбрать отобранных
                    </button>
                    <button
                      type="button"
                      onClick={clearUserSelection}
                      className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                      disabled={externalUsersLoading}
                    >
                      Очистить
                    </button>
                  </div>
                </div>

                {externalUsersLoading ? (
                  <div className="text-center py-4">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto"></div>
                    <p className="mt-2 text-sm text-gray-600">Загрузка пользователей...</p>
                  </div>
                ) : (
                  <div className="max-h-60 overflow-y-auto space-y-4">
                    {/* ЗАКОММЕНТИРОВАНО: Локальные пользователи
                    {(userSource === 'local' || userSource === 'both') && users.length > 0 && (
                      <div>
                        <h4 className="text-sm font-medium text-gray-700 mb-2 flex items-center">
                          <Users className="w-4 h-4 mr-1" />
                          Локальные пользователи ({users.length})
                        </h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          {users.map(user => (
                            <label key={user.id} className="flex items-center p-2 bg-white rounded border hover:bg-blue-50 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={selectedUsers.includes(user.id)}
                                onChange={() => toggleUserSelection(user.id)}
                                className="mr-2"
                                disabled={loading || !!currentBroadcast}
                              />
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium text-gray-900 truncate">
                                  {user.name}
                                </div>
                                <div className="text-xs text-gray-500">
                                  ID: {user.id}
                                  {user.telegram_id && ` • Telegram: ${user.telegram_id}`}
                                </div>
                              </div>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}
                    */}

                    {/* Пользователи */}
                    {externalUsers.length > 0 && (
                      <div>
                        <h4 className="text-sm font-medium text-gray-700 mb-2 flex items-center">
                          <Users className="w-4 h-4 mr-1" />
                          Пользователи ({externalUsers.length})
                        </h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          {externalUsers.map(user => (
                            <div key={user.telegram_id} className="flex items-center p-2 bg-white rounded border hover:bg-green-50">
                              <input
                                type="checkbox"
                                checked={selectedExternalUsers.includes(user.telegram_id.toString())}
                                onChange={() => toggleExternalUserSelection(user.telegram_id.toString())}
                                className="mr-2"
                                disabled={loading || !!currentBroadcast}
                              />
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium text-gray-900 truncate">
                                  {user.full_name}
                                </div>
                                <div className="text-xs text-gray-500">
                                  Telegram: {user.telegram_id}
                                  <br />
                                  {user.faculty} • {user.group}
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  handleViewProfile(user.telegram_id);
                                }}
                                className="ml-2 p-1 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded transition-colors"
                                title="Просмотреть профиль"
                                disabled={loading || !!currentBroadcast}
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {selectedExternalUsers.length > 0 && (
                  <div className="mt-3 p-2 bg-blue-50 border border-blue-200 rounded">
                    <p className="text-sm text-blue-800">
                      <strong>Примечание:</strong> Если пользователи не выбраны, рассылка будет отправлена всем доступным пользователям.
                    </p>
                  </div>
                )}
              </div>
            )}
            </div>
          )}

          {/* Выбор слотов */}
          {!useManualIds && (
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-700">
                  Выбор слотов для рассылки
                </label>
                <button
                  type="button"
                  onClick={() => setUseSlotSelection(!useSlotSelection)}
                  className="text-sm text-blue-600 hover:text-blue-800"
                  disabled={loading || !!currentBroadcast}
                >
                  {useSlotSelection ? 'Отключить' : 'Включить'} выбор по слотам
                </button>
              </div>
            
              {useSlotSelection && (
                <div className="border border-gray-300 rounded-md p-4 bg-gray-50">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm text-gray-600">
                      Выбрано слотов: {selectedSlotIds.length} из {slots.length}
                    </span>
                    <div className="space-x-2">
                      <button
                        type="button"
                        onClick={() => setSelectedSlotIds(slots.map(slot => slot.id))}
                        className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                        disabled={slotsLoading}
                      >
                        Выбрать все
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedSlotIds([])}
                        className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                        disabled={slotsLoading}
                      >
                        Очистить
                      </button>
                    </div>
                  </div>

                  {slotsLoading ? (
                    <div className="text-center py-4">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto"></div>
                      <p className="mt-2 text-sm text-gray-600">Загрузка слотов...</p>
                    </div>
                  ) : (
                    <div className="max-h-60 overflow-y-auto space-y-2">
                      {slots.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          {slots.map(slot => {
                            const slotBookings = bookings.filter(booking => booking.slot_id === slot.id);
                            const isSelected = selectedSlotIds.includes(slot.id);
                            
                            return (
                              <label key={slot.id} className="flex items-center p-2 bg-white rounded border hover:bg-green-50 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => {
                                    if (isSelected) {
                                      setSelectedSlotIds(prev => prev.filter(id => id !== slot.id));
                                    } else {
                                      setSelectedSlotIds(prev => [...prev, slot.id]);
                                    }
                                  }}
                                  className="mr-2"
                                  disabled={loading || !!currentBroadcast}
                                />
                                <div className="flex-1 min-w-0">
                                  <div className="text-sm font-medium text-gray-900 truncate">
                                    {slot.place}
                                  </div>
                                  <div className="text-xs text-gray-500">
                                    {new Date(slot.time).toLocaleString('ru-RU')} • {slotBookings.length}/{slot.max_user} записей
                                    {slotBookings.length >= slot.max_user && (
                                      <span className="ml-1 text-red-600 font-medium">(занят)</span>
                                    )}
                                  </div>
                                </div>
                              </label>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="text-center py-4 text-gray-500">
                          <p className="text-sm">Слоты не найдены</p>
                        </div>
                      )}
                    </div>
                  )}

                  {selectedSlotIds.length > 0 && (
                    <div className="mt-3 p-2 bg-green-50 border border-green-200 rounded">
                      <p className="text-sm text-green-800">
                        <strong>Выбрано слотов:</strong> {selectedSlotIds.length}
                        <br />
                        <strong>Пользователей в слотах:</strong> {getUsersBySelectedSlots().length}
                        <br />
                        <strong>Детали:</strong> {selectedSlotIds.map(slotId => {
                          const slot = slots.find(s => s.id === slotId);
                          const slotBookings = bookings.filter(b => b.slot_id === slotId);
                          return slot ? `${slot.place} (${slotBookings.length}/${slot.max_user})` : '';
                        }).filter(Boolean).join(', ')}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
              <AlertCircle className="inline w-4 h-4 mr-2" />
              {error}
            </div>
          )}

          <div className="space-y-3">
            <div className="flex gap-3">
              <button
                type="submit"
                disabled={loading || !message.trim() || !!currentBroadcast}
                className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Send className="w-4 h-4 mr-2" />
                {loading ? 'Создание...' : 'Создать рассылку'}
              </button>

              <button
                type="button"
                onClick={handleSendSignUpMessage}
                disabled={loading || !!currentBroadcast}
                className="flex items-center px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Users className="w-4 h-4 mr-2" />
                {loading ? 'Создание...' : 'Рассылка о записи'}
              </button>
            </div>
            
            <div className="text-sm text-gray-600 space-y-1">
              <p><strong>Создать рассылку:</strong> Отправка произвольного сообщения выбранным пользователям</p>
              <p><strong>Рассылка о записи:</strong> Отправка уведомления о возможности записи на собеседование с кнопкой записи</p>
              {useManualIds && (
                <p className="text-blue-600"><strong>Ручной ввод ID:</strong> Рассылка будет отправлена только указанным пользователям</p>
              )}
            </div>

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
              
              {/* Кнопка обновления статуса */}
              <button
                onClick={async () => {
                  try {
                    const status = await broadcastApi.getStatus(currentBroadcast.broadcast_id);
                    if (status) {
                      setBroadcastStatus(status);
                      setCurrentBroadcast(prev => prev ? { ...prev, status: status.broadcast.status } : null);
                    }
                  } catch (err) {
                    console.error('Failed to refresh status:', err);
                  }
                }}
                className="flex items-center px-3 py-2 text-sm font-medium text-blue-700 bg-blue-100 rounded-md hover:bg-blue-200"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Обновить
              </button>
              
              {(currentBroadcast.status === 'completed' || currentBroadcast.status === 'failed') && (
                <button
                  onClick={() => {
                    setCurrentBroadcast(null);
                    setBroadcastStatus(null);
                    // Очищаем polling при закрытии
                    if (pollingInterval) {
                      window.clearInterval(pollingInterval);
                      setPollingInterval(null);
                    }
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
                       <div className="flex space-x-2">
                         <button
                           onClick={() => handleViewDetails(broadcast.id)}
                           className="text-blue-600 hover:text-blue-900"
                         >
                           Детали
                         </button>
                         <button
                           onClick={() => handleDeleteBroadcast(broadcast.id)}
                           className="text-red-600 hover:text-red-900"
                         >
                           Удалить
                         </button>
                       </div>
                     </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* User Profile Modal */}
      {selectedUserProfile && (
        <UserProfile
          telegramId={selectedUserProfile}
          isOpen={isProfileOpen}
          onClose={handleCloseProfile}
        />
      )}

      {/* Confirmation Dialog */}
      {showConfirmDialog && pendingBroadcast && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex items-center mb-4">
              <AlertCircle className="h-6 w-6 text-orange-500 mr-3" />
              <h3 className="text-lg font-semibold text-gray-900">
                Подтверждение рассылки
              </h3>
            </div>
            
            <div className="mb-4">
              <p className="text-sm text-gray-600 mb-3">
                <strong>Тип рассылки:</strong> {pendingBroadcast.type === 'custom' ? 'Произвольное сообщение' : 'Рассылка о записи'}
              </p>
              
              <p className="text-sm text-gray-600 mb-3">
                <strong>Количество получателей:</strong> {pendingBroadcast.users.length}
              </p>
              
              {pendingBroadcast.users.length > 0 && (
                <div className="mb-3">
                  <p className="text-sm text-gray-600 mb-2"><strong>ID получателей:</strong></p>
                  <div className="bg-gray-50 p-2 rounded text-xs font-mono max-h-20 overflow-y-auto">
                    {pendingBroadcast.users.join(', ')}
                  </div>
                </div>
              )}
              
              {pendingBroadcast.users.length === 0 && (
                <div className="mb-3 p-3 bg-yellow-50 border border-yellow-200 rounded">
                  <p className="text-sm text-yellow-800">
                    <strong>⚠️ Внимание:</strong> Рассылка будет отправлена ВСЕМ пользователям в системе!
                  </p>
                </div>
              )}
              
              {pendingBroadcast.type === 'custom' && (
                <div className="mb-3">
                  <p className="text-sm text-gray-600 mb-2"><strong>Сообщение:</strong></p>
                  <div className="bg-gray-50 p-2 rounded text-sm max-h-20 overflow-y-auto">
                    {pendingBroadcast.message}
                  </div>
                </div>
              )}
              
              {mediaFiles.length > 0 && (
                <div className="mb-3">
                  <p className="text-sm text-gray-600 mb-2"><strong>Медиафайлы ({mediaFiles.length}):</strong></p>
                  <div className="bg-gray-50 p-2 rounded text-sm max-h-20 overflow-y-auto">
                    {mediaFiles.map((file, index) => (
                      <div key={index} className="flex items-center space-x-2 text-xs">
                        {getMediaIcon(file.media_type)}
                        <span className="truncate">{file.file_path}</span>
                        {file.caption && index === 0 && <span className="text-blue-600">({file.caption})</span>}
                        {index === 0 && <span className="text-xs text-blue-600 font-medium">[подпись]</span>}
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Подпись будет показана только с первым файлом в медиагруппе
                  </p>
                </div>
              )}
            </div>
            
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => {
                  setShowConfirmDialog(false);
                  setPendingBroadcast(null);
                }}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
                disabled={loading}
              >
                Отмена
              </button>
              <button
                onClick={executeBroadcast}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
                disabled={loading}
              >
                {loading ? 'Создание...' : 'Подтвердить рассылку'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Broadcast;
