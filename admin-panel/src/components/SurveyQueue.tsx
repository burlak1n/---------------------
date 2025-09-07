import React, { useState, useEffect } from 'react';
import { Clock, CheckCircle, XCircle, Users, Eye, EyeOff, RefreshCw } from 'lucide-react';
import { votesApi } from '../api';
import type { Vote, SurveyVoteSummary } from '../types';

interface SurveyQueueProps {
  onRefresh?: () => void;
}

const SurveyQueue: React.FC<SurveyQueueProps> = ({ onRefresh }) => {
  const [votes, setVotes] = useState<Vote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedSurveys, setExpandedSurveys] = useState<Set<number>>(new Set());
  const [userInfo, setUserInfo] = useState<Record<number, any>>({});
  const [loadingUsers, setLoadingUsers] = useState<Set<number>>(new Set());
  const [responsibleUsers, setResponsibleUsers] = useState<Set<number>>(new Set());

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [votesData, responsibleUsersData] = await Promise.all([
        votesApi.getAll(),
        votesApi.getResponsibleUsers()
      ]);
      setVotes(votesData);
      setResponsibleUsers(new Set(responsibleUsersData));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadVotes = async () => {
    try {
      setLoading(true);
      const data = await votesApi.getAll();
      setVotes(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadUserInfo = async (telegramId: number) => {
    if (userInfo[telegramId] || loadingUsers.has(telegramId)) {
      return; // Уже загружено или загружается
    }

    setLoadingUsers(prev => new Set(prev).add(telegramId));

    try {
      const response = await fetch(`/api/users/${telegramId}/info`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const userData = await response.json();
        setUserInfo(prev => ({
          ...prev,
          [telegramId]: userData.user_profile || userData
        }));
      } else if (response.status === 404) {
        setUserInfo(prev => ({
          ...prev,
          [telegramId]: { error: 'Пользователь не найден' }
        }));
      } else {
        console.error(`Ошибка загрузки пользователя ${telegramId}:`, response.status);
        setUserInfo(prev => ({
          ...prev,
          [telegramId]: { error: `Ошибка ${response.status}` }
        }));
      }
    } catch (err) {
      console.error(`Ошибка загрузки пользователя ${telegramId}:`, err);
      setUserInfo(prev => ({
        ...prev,
        [telegramId]: { error: 'Ошибка загрузки' }
      }));
    } finally {
      setLoadingUsers(prev => {
        const newSet = new Set(prev);
        newSet.delete(telegramId);
        return newSet;
      });
    }
  };

  const toggleSurvey = (surveyId: number) => {
    const newExpanded = new Set(expandedSurveys);
    if (newExpanded.has(surveyId)) {
      newExpanded.delete(surveyId);
    } else {
      newExpanded.add(surveyId);
    }
    setExpandedSurveys(newExpanded);
  };

  // Группируем голоса по анкетам
  const surveyGroups = votes.reduce((acc, vote) => {
    if (!acc[vote.survey_id]) {
      acc[vote.survey_id] = [];
    }
    acc[vote.survey_id].push(vote);
    return acc;
  }, {} as Record<number, Vote[]>);

  // Создаем сводки по анкетам
  const surveySummaries: SurveyVoteSummary[] = Object.entries(surveyGroups).map(([surveyId, surveyVotes]) => {
    // Фильтруем голоса: "В обработке" не считаются как обычные голоса
    const regularVotes = surveyVotes.filter(v => v.comment !== 'В обработке');
    const approveVotes = regularVotes.filter(v => v.decision === 1).length;
    const rejectVotes = regularVotes.filter(v => v.decision === 0).length;
    const inProgressVotes = surveyVotes.filter(v => v.comment === 'В обработке').length;
    const totalVotes = approveVotes + rejectVotes;
    
    // Проверяем, есть ли голос от ответственного (только среди обычных голосов, не "В обработке")
    const hasResponsibleVote = regularVotes.some(vote => responsibleUsers.has(vote.voter_telegram_id));
    
    // Проверяем, есть ли положительный голос от ответственного
    const hasResponsibleApproveVote = regularVotes.some(vote => 
      responsibleUsers.has(vote.voter_telegram_id) && vote.decision === 1
    );
    
    // Определяем статус
    let status: 'InProgress' | 'ReadyForReview' | 'Completed' = 'InProgress';
    
    if (inProgressVotes > 0) {
      // Есть записи "В обработке"
      status = 'InProgress';
    } else if (hasResponsibleVote) {
      // Есть голос от ответственного - завершено
      status = 'Completed';
    } else if (totalVotes >= 3) {
      // 3 голосов, но нет ответственного - готово к проверке
      status = 'ReadyForReview';
    } else {
      status = 'InProgress';
    }
    
    return {
      survey_id: parseInt(surveyId),
      total_votes: totalVotes,
      approve_votes: approveVotes,
      reject_votes: rejectVotes,
      status,
      has_responsible_vote: hasResponsibleVote,
      has_responsible_approve_vote: hasResponsibleApproveVote,
      in_progress_votes: inProgressVotes
    };
  });

  // Сортируем по статусу и количеству голосов
  const sortedSummaries = surveySummaries.sort((a, b) => {
    // Сначала по статусу
    const statusOrder = { 'InProgress': 0, 'ReadyForReview': 1, 'Completed': 2 };
    const statusDiff = statusOrder[a.status] - statusOrder[b.status];
    if (statusDiff !== 0) return statusDiff;
    
    // Затем по количеству голосов (убывание)
    return b.total_votes - a.total_votes;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'InProgress': return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 'ReadyForReview': return 'text-blue-600 bg-blue-50 border-blue-200';
      case 'Completed': return 'text-green-600 bg-green-50 border-green-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'InProgress': return 'В процессе';
      case 'ReadyForReview': return 'Готово к проверке';
      case 'Completed': return 'Завершено';
      default: return 'Неизвестно';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'InProgress': return <Clock className="h-4 w-4" />;
      case 'ReadyForReview': return <Users className="h-4 w-4" />;
      case 'Completed': return <CheckCircle className="h-4 w-4" />;
      default: return <Clock className="h-4 w-4" />;
    }
  };

  const renderVoteIndicators = (votes: Vote[]) => {
    const indicators = [];
    
    // Создаем массив из 5 слотов
    for (let i = 0; i < 5; i++) {
      if (i < votes.length) {
        const vote = votes[i];
        const isProcessing = vote.comment === 'В обработке';
        
        const isResponsible = responsibleUsers.has(vote.voter_telegram_id);
        const roleText = isResponsible ? ' (ответственный)' : '';
        
        if (isProcessing) {
          // Оранжевый кружок с анимацией для "В обработке" (приоритет над decision)
          indicators.push(
            <div
              key={i}
              className={`w-6 h-6 rounded-full flex items-center justify-center animate-pulse relative ${
                isResponsible ? 'bg-orange-500 ring-2 ring-yellow-400' : 'bg-orange-400'
              }`}
              title={`В обработке (${vote.voter_telegram_id})${roleText}`}
            >
              <Clock className="w-4 h-4 text-white" />
              {isResponsible && (
                <div className="absolute -top-1 -right-1 text-yellow-400">
                  <span className="text-xs">👑</span>
                </div>
              )}
            </div>
          );
        } else if (vote.decision === 1) {
          // Зеленый кружок для одобрения
          indicators.push(
            <div
              key={i}
              className={`w-6 h-6 rounded-full flex items-center justify-center relative ${
                isResponsible ? 'bg-green-600 ring-2 ring-yellow-400' : 'bg-green-500'
              }`}
              title={`Одобрено (${vote.voter_telegram_id})${roleText}`}
            >
              <CheckCircle className="w-4 h-4 text-white" />
              {isResponsible && (
                <div className="absolute -top-1 -right-1 text-yellow-400">
                  <span className="text-xs">👑</span>
                </div>
              )}
            </div>
          );
        } else {
          // Красный кружок для отклонения
          indicators.push(
            <div
              key={i}
              className={`w-6 h-6 rounded-full flex items-center justify-center relative ${
                isResponsible ? 'bg-red-600 ring-2 ring-yellow-400' : 'bg-red-500'
              }`}
              title={`Отклонено (${vote.voter_telegram_id})${roleText}`}
            >
              <XCircle className="w-4 h-4 text-white" />
              {isResponsible && (
                <div className="absolute -top-1 -right-1 text-yellow-400">
                  <span className="text-xs">👑</span>
                </div>
              )}
            </div>
          );
        }
      } else {
        // Пустой серый кружок
        indicators.push(
          <div
            key={i}
            className="w-6 h-6 rounded-full bg-gray-200 border-2 border-gray-300"
            title="Ожидает голоса"
          />
        );
      }
    }
    
    return indicators;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const moscowTime = new Date(date.getTime() + (3 * 60 * 60 * 1000));
    return moscowTime.toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-2 text-gray-600">Загрузка очереди анкет...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900">Очередь анкет</h2>
        <button
          onClick={() => {
            loadVotes();
            onRefresh?.();
          }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
        >
          <RefreshCw className="h-4 w-4" />
          Обновить
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <p className="text-red-700">{error}</p>
        </div>
      )}

      {/* Статистика */}
      <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
          <div className="text-sm font-medium text-gray-500">Всего анкет</div>
          <div className="text-2xl font-bold text-gray-900">{sortedSummaries.length}</div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
          <div className="text-sm font-medium text-gray-500">В обработке</div>
          <div className="text-2xl font-bold text-orange-600">
            {sortedSummaries.filter(s => s.in_progress_votes && s.in_progress_votes > 0).length}
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
          <div className="text-sm font-medium text-gray-500">В процессе</div>
          <div className="text-2xl font-bold text-yellow-600">
            {sortedSummaries.filter(s => s.status === 'InProgress' && (!s.in_progress_votes || s.in_progress_votes === 0)).length}
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
          <div className="text-sm font-medium text-gray-500">Готово к проверке</div>
          <div className="text-2xl font-bold text-blue-600">
            {sortedSummaries.filter(s => s.status === 'ReadyForReview').length}
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
          <div className="text-sm font-medium text-gray-500">Взято</div>
          <div className="text-2xl font-bold text-purple-600">
            {sortedSummaries.filter(s => s.status === 'Completed' && s.has_responsible_approve_vote).length}
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
          <div className="text-sm font-medium text-gray-500">Завершено</div>
          <div className="text-2xl font-bold text-green-600">
            {sortedSummaries.filter(s => s.status === 'Completed').length}
          </div>
        </div>
      </div>

      {/* Список анкет */}
      <div className="space-y-4">
        {sortedSummaries.map((summary) => {
          const surveyVotes = surveyGroups[summary.survey_id] || [];
          const isExpanded = expandedSurveys.has(summary.survey_id);
          
          return (
            <div
              key={summary.survey_id}
              className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden"
            >
              {/* Заголовок анкеты */}
              <div
                className="p-4 cursor-pointer hover:bg-gray-50 transition-colors"
                onClick={() => toggleSurvey(summary.survey_id)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    {/* Индикаторы голосов */}
                    <div className="flex gap-1">
                      {renderVoteIndicators(surveyVotes)}
                    </div>
                    
                    {/* Информация об анкете */}
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-lg font-semibold text-gray-900">
                          Анкета #{summary.survey_id}
                        </h3>
                        <span className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded-full border ${getStatusColor(summary.status)}`}>
                          {getStatusIcon(summary.status)}
                          {getStatusText(summary.status)}
                        </span>
                      </div>
                      <div className="text-sm text-gray-500 mt-1">
                        {summary.approve_votes} одобрений • {summary.reject_votes} отклонений • {summary.total_votes}/5 голосов
                        {summary.in_progress_votes && summary.in_progress_votes > 0 && (
                          <span className="ml-2 text-orange-600 font-medium">
                            • {summary.in_progress_votes} в обработке
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  {/* Кнопка развернуть/свернуть */}
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-500">
                      {isExpanded ? 'Свернуть' : 'Подробнее'}
                    </span>
                    {isExpanded ? <EyeOff className="h-4 w-4 text-gray-400" /> : <Eye className="h-4 w-4 text-gray-400" />}
                  </div>
                </div>
              </div>

              {/* Детали голосов */}
              {isExpanded && (
                <div className="border-t border-gray-200 bg-gray-50 p-4">
                  <h4 className="text-sm font-medium text-gray-700 mb-3">Детали голосования</h4>
                  <div className="space-y-2">
                    {surveyVotes.map((vote) => (
                      <div
                        key={vote.id}
                        className="flex items-center justify-between bg-white p-3 rounded-md border border-gray-200"
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex-shrink-0">
                            {renderVoteIndicators([vote])}
                          </div>
                          <div>
                            <div className="text-sm font-medium text-gray-900">
                              <button
                                onClick={() => loadUserInfo(vote.voter_telegram_id)}
                                className="text-blue-600 hover:text-blue-800 hover:underline font-mono"
                                disabled={loadingUsers.has(vote.voter_telegram_id)}
                              >
                                {loadingUsers.has(vote.voter_telegram_id) ? 'Загрузка...' : vote.voter_telegram_id}
                              </button>
                              {responsibleUsers.has(vote.voter_telegram_id) && (
                                <span className="ml-2 inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800 border border-yellow-200">
                                  👑 Ответственный
                                </span>
                              )}
                              {vote.comment === 'В обработке' && (
                                <span className="ml-2 inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded-full bg-orange-100 text-orange-800 border border-orange-200">
                                  <Clock className="h-3 w-3" />
                                  В обработке
                                </span>
                              )}
                            </div>
                            
                            {/* Информация о пользователе */}
                            {userInfo[vote.voter_telegram_id] && !userInfo[vote.voter_telegram_id].error && (
                              <div className="text-xs text-gray-600 mt-1 space-y-1">
                                {userInfo[vote.voter_telegram_id].full_name && (
                                  <div><strong>ФИО:</strong> {userInfo[vote.voter_telegram_id].full_name}</div>
                                )}
                                {userInfo[vote.voter_telegram_id].telegram_nickname && (
                                  <div><strong>Telegram:</strong> @{userInfo[vote.voter_telegram_id].telegram_nickname}</div>
                                )}
                                {userInfo[vote.voter_telegram_id].phone_number && (
                                  <div><strong>Телефон:</strong> {userInfo[vote.voter_telegram_id].phone_number}</div>
                                )}
                                {userInfo[vote.voter_telegram_id].year_of_admission && (
                                  <div><strong>Курс:</strong> {(() => {
                                    const currentYear = new Date().getFullYear();
                                    const currentMonth = new Date().getMonth(); // 0-11, где 0 = январь
                                    const admissionYear = userInfo[vote.voter_telegram_id].year_of_admission;
                                    
                                    // Если сейчас октябрь (9) или позже, курс = текущий год - год поступления + 1
                                    // Если раньше октября, курс = текущий год - год поступления
                                    const course = currentMonth >= 9 ? 
                                      currentYear - admissionYear + 1 : 
                                      currentYear - admissionYear;
                                    
                                    return course;
                                  })()} курс</div>
                                )}
                              </div>
                            )}
                            
                            {userInfo[vote.voter_telegram_id]?.error && (
                              <div className="text-xs text-red-500 mt-1">
                                {userInfo[vote.voter_telegram_id].error}
                              </div>
                            )}
                            
                            {vote.comment && vote.comment !== 'В обработке' && (
                              <div className="text-sm text-gray-500 mt-1">
                                {vote.comment}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="text-sm text-gray-500">
                          {formatDate(vote.created_at)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {sortedSummaries.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          <Clock className="h-12 w-12 mx-auto mb-4 text-gray-300" />
          <p className="text-lg">Анкет в очереди нет</p>
          <p className="text-sm">Все анкеты обработаны или еще не поступили</p>
        </div>
      )}
    </div>
  );
};

export default SurveyQueue;
