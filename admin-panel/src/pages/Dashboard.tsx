import React, { useState, useEffect } from 'react';
import ReactECharts from 'echarts-for-react';
import { BarChart, TrendingUp, Users, CheckCircle, Clock } from 'lucide-react';

interface Vote {
  id: number;
  survey_id: number;
  voter_telegram_id: number;
  decision: number; // 1 - approve, 0 - reject
  comment?: string;
  created_at: string;
}

interface SurveyStats {
  total_surveys: number;
  total_votes: number;
  approved_votes: number;
  rejected_votes: number;
  votes_by_survey: Array<{
    survey_id: number;
    total_votes: number;
    approved_votes: number;
    rejected_votes: number;
  }>;
  votes_by_date: Array<{
    date: string;
    votes: number;
    approved: number;
    rejected: number;
  }>;
  user_participation: Array<{
    user_type: string;
    count: number;
  }>;
}

interface SurveyVoteSummary {
  survey_id: number;
  total_votes: number;
  approve_votes: number;
  reject_votes: number;
  status: 'InProgress' | 'ReadyForReview' | 'Completed';
  has_responsible_vote: boolean;
}

interface UserRole {
  telegram_id: number;
  role: number; // 0 - обычный, 1 - ответственный
}

interface UserStats {
  telegram_id: number;
  total_votes: number;
  approve_votes: number;
  reject_votes: number;
  like_percentage: number;
  agreement_with_responsible: number;
  responsible_votes_count: number;
}

const Dashboard: React.FC = () => {
  const [stats, setStats] = useState<SurveyStats | null>(null);
  const [surveySummaries, setSurveySummaries] = useState<SurveyVoteSummary[]>([]);
  const [userStats, setUserStats] = useState<UserStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSurveyId, setSelectedSurveyId] = useState<number | null>(null);
  const [surveyComments, setSurveyComments] = useState<Vote[]>([]);
  const [showComments, setShowComments] = useState(false);
  const [allVotes, setAllVotes] = useState<Vote[]>([]);

  useEffect(() => {
    loadStats();
  }, []);

  const loadUserComments = (userId: number) => {
    // Фильтруем комментарии пользователя из уже загруженных данных
    const comments = allVotes.filter(v => v.voter_telegram_id === userId && v.comment && v.comment.trim());
    setSurveyComments(comments);
    setSelectedSurveyId(userId);
    setShowComments(true);
  };

  const loadStats = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Загружаем все голоса из API
      const votesResponse = await fetch('/api/votes');
      if (!votesResponse.ok) {
        setError('Ошибка при загрузке данных голосования');
        return;
      }
      const votes: Vote[] = await votesResponse.json();
      setAllVotes(votes); // Сохраняем votes в состоянии
      
      // Загружаем роли пользователей
      const rolesResponse = await fetch('/api/user_roles');
      let roles: UserRole[] = [];
      if (rolesResponse.ok) {
        const roleData = await rolesResponse.json();
        roles = roleData.map((r: any) => ({
          telegram_id: r.telegram_id,
          role: r.role
        }));
      }
        
        // Анализируем данные на frontend
        const stats = analyzeVotes(votes);
        setStats(stats);
      
      // Создаем сводки голосований
      const summaries = createSurveySummaries(votes, roles);
      setSurveySummaries(summaries);
      
      // Создаем статистику пользователей
      const userStats = createUserStats(votes, roles);
      setUserStats(userStats);
      
    } catch (err: any) {
      setError(err.message || 'Ошибка при загрузке статистики');
      } finally {
        setLoading(false);
      }
    };

  const analyzeVotes = (votes: Vote[]): SurveyStats => {
    // Получаем уникальные survey_id
    const uniqueSurveys = [...new Set(votes.map(v => v.survey_id))];
    
    // Подсчитываем общую статистику
    const total_votes = votes.length;
    const approved_votes = votes.filter(v => v.decision === 1).length;
    const rejected_votes = votes.filter(v => v.decision === 0).length;
    
    // Анализируем голоса по анкетам
    const votes_by_survey = uniqueSurveys.map(survey_id => {
      const surveyVotes = votes.filter(v => v.survey_id === survey_id);
      return {
        survey_id,
        total_votes: surveyVotes.length,
        approved_votes: surveyVotes.filter(v => v.decision === 1).length,
        rejected_votes: surveyVotes.filter(v => v.decision === 0).length
      };
    });
    
    // Анализируем голоса по минутам
    const votesByMinute = new Map<string, { votes: number; approved: number; rejected: number }>();
    votes.forEach(vote => {
      const date = new Date(vote.created_at);
      const minute = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
      if (!votesByMinute.has(minute)) {
        votesByMinute.set(minute, { votes: 0, approved: 0, rejected: 0 });
      }
      const minuteStats = votesByMinute.get(minute)!;
      minuteStats.votes++;
      if (vote.decision === 1) {
        minuteStats.approved++;
      } else {
        minuteStats.rejected++;
      }
    });
    
    const votes_by_date = Array.from(votesByMinute.entries())
      .map(([minute, stats]) => ({ date: minute, ...stats }))
      .sort((a, b) => a.date.localeCompare(b.date));
    
    // Анализируем участие пользователей (нужно будет получить роли)
    const uniqueVoters = [...new Set(votes.map(v => v.voter_telegram_id))];
    const user_participation = [
      { user_type: "Уникальные голосующие", count: uniqueVoters.length },
      { user_type: "Всего голосов", count: total_votes }
    ];
    
    return {
      total_surveys: uniqueSurveys.length,
      total_votes,
      approved_votes,
      rejected_votes,
      votes_by_survey,
      votes_by_date,
      user_participation
    };
  };

  const createSurveySummaries = (votes: Vote[], roles: UserRole[]): SurveyVoteSummary[] => {
    const uniqueSurveys = [...new Set(votes.map(v => v.survey_id))];
    const responsibleIds = new Set(roles.filter(r => r.role === 1).map(r => r.telegram_id));
    
    return uniqueSurveys.map(survey_id => {
      const surveyVotes = votes.filter(v => v.survey_id === survey_id);
      const regularVotes = surveyVotes.filter(v => v.comment !== 'В обработке');
      const approve_votes = regularVotes.filter(v => v.decision === 1).length;
      const reject_votes = regularVotes.filter(v => v.decision === 0).length;
      const total_votes = approve_votes + reject_votes;
      
      // Проверяем, есть ли голос от ответственного (только среди обычных голосов, не "В обработке")
      const has_responsible_vote = regularVotes.some(v => responsibleIds.has(v.voter_telegram_id));
      
      // Определяем статус
      let status: 'InProgress' | 'ReadyForReview' | 'Completed';
      if (has_responsible_vote) {
        status = 'Completed';
      } else if (total_votes >= 5) {
        status = 'ReadyForReview';
      } else {
        status = 'InProgress';
      }
      
      return {
        survey_id,
        total_votes,
        approve_votes,
        reject_votes,
        status,
        has_responsible_vote
      };
    }).sort((a, b) => {
      // Сортировка по приоритету: ответственные сверху, затем по количеству голосов
      if (a.has_responsible_vote && !b.has_responsible_vote) return -1;
      if (!a.has_responsible_vote && b.has_responsible_vote) return 1;
      
      // Если оба имеют или не имеют голос ответственного, сортируем по количеству голосов
      return b.total_votes - a.total_votes;
    });
  };

  const createUserStats = (votes: Vote[], roles: UserRole[]): UserStats[] => {
    const responsibleIds = new Set(roles.filter(r => r.role === 1).map(r => r.telegram_id));
    const uniqueUsers = [...new Set(votes.map(v => v.voter_telegram_id))];
    
    return uniqueUsers.map(userId => {
      const userVotes = votes.filter(v => v.voter_telegram_id === userId);
      const approve_votes = userVotes.filter(v => v.decision === 1).length;
      const reject_votes = userVotes.filter(v => v.decision === 0).length;
      const total_votes = approve_votes + reject_votes;
      
      // Процент лайков (одобрений)
      const like_percentage = total_votes > 0 ? Math.round((approve_votes / total_votes) * 100) : 0;
      
      // Считаем совпадения с мнением ответственных
      let agreement_count = 0;
      let responsible_votes_count = 0;
      
      userVotes.forEach(userVote => {
        // Находим голоса ответственных по той же анкете
        const responsibleVotes = votes.filter(v => 
          v.survey_id === userVote.survey_id && 
          responsibleIds.has(v.voter_telegram_id)
        );
        
        if (responsibleVotes.length > 0) {
          responsible_votes_count++;
          // Проверяем совпадение с любым ответственным
          const hasAgreement = responsibleVotes.some(rv => rv.decision === userVote.decision);
          if (hasAgreement) {
            agreement_count++;
          }
        }
      });
      
      // Процент совпадения с мнением ответственного
      const agreement_with_responsible = responsible_votes_count > 0 
        ? Math.round((agreement_count / responsible_votes_count) * 100) 
        : 0;
      
      return {
        telegram_id: userId,
        total_votes,
        approve_votes,
        reject_votes,
        like_percentage,
        agreement_with_responsible,
        responsible_votes_count
      };
    }).sort((a, b) => {
      // Сортируем по убыванию процента лайков
      return b.like_percentage - a.like_percentage;
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error}</p>
          <button
            onClick={loadStats}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          >
            Попробовать снова
          </button>
        </div>
      </div>
    );
  }

  if (!stats) return null;


  // Конфигурация для графика голосов по минутам
  const votesByMinuteOption = {
    title: {
      text: 'Активность голосования по минутам',
      left: 'center',
      textStyle: {
        fontSize: 16,
        fontWeight: 'bold'
      }
    },
    tooltip: {
      trigger: 'axis',
      formatter: function(params: any) {
        const data = params[0];
        const minuteData = stats.votes_by_date[data.dataIndex];
        return `
          <div>
            <strong>${data.axisValue}</strong><br/>
            Всего голосов: ${minuteData.votes}<br/>
            Одобрено: ${minuteData.approved}<br/>
            Отклонено: ${minuteData.rejected}
        `;
      }
    },
    legend: {
      data: ['Всего голосов', 'Одобрено', 'Отклонено'],
      top: 30
    },
    xAxis: {
      type: 'category',
      data: stats.votes_by_date.map(d => d.date),
      axisLabel: {
        rotate: 45,
        fontSize: 10
      }
    },
    yAxis: {
      type: 'value',
      name: 'Количество голосов'
    },
    series: [
      {
        name: 'Всего голосов',
        type: 'line',
        data: stats.votes_by_date.map(d => d.votes),
        smooth: true,
        lineStyle: { color: '#3B82F6' },
        itemStyle: { color: '#3B82F6' }
      },
      {
        name: 'Одобрено',
        type: 'line',
        data: stats.votes_by_date.map(d => d.approved),
        smooth: true,
        lineStyle: { color: '#10B981' },
        itemStyle: { color: '#10B981' }
      },
      {
        name: 'Отклонено',
        type: 'line',
        data: stats.votes_by_date.map(d => d.rejected),
        smooth: true,
        lineStyle: { color: '#EF4444' },
        itemStyle: { color: '#EF4444' }
      }
    ]
  };

  // Конфигурация для диаграммы распределения процента лайков
  const likePercentageDistributionOption = {
    title: {
      text: 'Распределение процента лайков',
      left: 'center',
      textStyle: {
        fontSize: 16,
        fontWeight: 'bold'
      }
    },
    tooltip: {
      trigger: 'axis',
      formatter: function(params: any) {
        const data = params[0];
        const user = userStats[data.dataIndex];
        return `
          <div>
            <strong>Пользователь ${user.telegram_id}</strong><br/>
            Процент лайков: ${user.like_percentage}%<br/>
            Одобрений: ${user.approve_votes}<br/>
            Всего голосов: ${user.total_votes}
        `;
      }
    },
    xAxis: {
      type: 'category',
      data: userStats
        .sort((a, b) => a.like_percentage - b.like_percentage)
        .map(user => `ID ${user.telegram_id}`),
      axisLabel: {
        rotate: 45,
        fontSize: 10
      },
      name: 'Пользователи'
    },
    yAxis: {
      type: 'value',
      name: 'Процент лайков (%)',
      min: 0,
      max: 100
    },
    series: [
      {
        name: 'Процент лайков',
        type: 'bar',
        data: userStats
          .sort((a, b) => a.like_percentage - b.like_percentage)
          .map(user => ({
            value: user.like_percentage,
            itemStyle: {
              color: user.like_percentage >= 70 
                ? '#10B981' 
                : user.like_percentage >= 50
                ? '#F59E0B'
                : '#EF4444'
            }
          })),
        barWidth: '60%'
      }
    ]
  };

  // Конфигурация для круговой диаграммы участия пользователей
  const userParticipationOption = {
    title: {
      text: 'Участие пользователей',
      left: 'center',
      textStyle: {
        fontSize: 16,
        fontWeight: 'bold'
      }
    },
    tooltip: {
      trigger: 'item',
      formatter: '{a} <br/>{b}: {c} ({d}%)'
    },
    legend: {
      orient: 'vertical',
      left: 'left',
      top: 'middle'
    },
    series: [
      {
        name: 'Пользователи',
        type: 'pie',
        radius: ['40%', '70%'],
        center: ['60%', '50%'],
        data: stats.user_participation.map(u => ({
          value: u.count,
          name: u.user_type,
          itemStyle: {
            color: u.user_type === 'Ответственные' ? '#10B981' : '#3B82F6'
          }
        })),
        emphasis: {
          itemStyle: {
            shadowBlur: 10,
            shadowOffsetX: 0,
            shadowColor: 'rgba(0, 0, 0, 0.5)'
          }
        }
      }
    ]
  };

  return (
    <div className="space-y-6">
      {/* Заголовок */}
      <div className="flex justify-between items-center">
    <div>
        <h1 className="text-2xl font-bold text-gray-900">Панель управления</h1>
          <p className="text-gray-600">Статистика системы голосования</p>
        </div>
        <button
          onClick={loadStats}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
        >
          <TrendingUp className="h-4 w-4" />
          Обновить
        </button>
      </div>

      {/* Карточки с основными метриками */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <div className="flex items-center">
            <div className="p-2 bg-blue-100 rounded-lg">
              <BarChart className="h-6 w-6 text-blue-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Всего анкет</p>
              <p className="text-2xl font-bold text-gray-900">{stats.total_surveys}</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <div className="flex items-center">
            <div className="p-2 bg-green-100 rounded-lg">
              <Users className="h-6 w-6 text-green-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Всего голосов</p>
              <p className="text-2xl font-bold text-gray-900">{stats.total_votes}</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border">
              <div className="flex items-center">
            <div className="p-2 bg-emerald-100 rounded-lg">
              <CheckCircle className="h-6 w-6 text-emerald-600" />
                </div>
                <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Одобрено</p>
              <p className="text-2xl font-bold text-gray-900">{stats.approved_votes}</p>
            </div>
                </div>
              </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <div className="flex items-center">
            <div className="p-2 bg-red-100 rounded-lg">
              <Clock className="h-6 w-6 text-red-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Отклонено</p>
              <p className="text-2xl font-bold text-gray-900">{stats.rejected_votes}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Таблица голосований */}
      <div className="bg-white p-6 rounded-lg shadow-sm border">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Таблица голосований</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  ID Анкеты
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Статус
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Всего голосов
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Одобрено
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Отклонено
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Ответственный
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {surveySummaries.map((survey) => (
                <tr key={survey.survey_id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {survey.survey_id}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                      survey.status === 'Completed' 
                        ? 'bg-green-100 text-green-800' 
                        : survey.status === 'ReadyForReview'
                        ? 'bg-yellow-100 text-yellow-800'
                        : 'bg-blue-100 text-blue-800'
                    }`}>
                      {survey.status === 'Completed' 
                        ? 'Завершено' 
                        : survey.status === 'ReadyForReview'
                        ? 'Готово к проверке'
                        : 'В процессе'
                      }
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {survey.total_votes}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-green-600">
                    {survey.approve_votes}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-red-600">
                    {survey.reject_votes}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                      survey.has_responsible_vote 
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-gray-100 text-gray-800'
                    }`}>
                      {survey.has_responsible_vote ? 'Да' : 'Нет'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Статистика пользователей */}
      <div className="bg-white p-6 rounded-lg shadow-sm border">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Статистика пользователей</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  ID Пользователя
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Всего голосов
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Одобрено
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Отклонено
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  % Лайков
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Совпадение с ответственным
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Голосов с ответственным
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {userStats.map((user) => (
                <tr key={user.telegram_id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    <button
                      onClick={() => loadUserComments(user.telegram_id)}
                      className="text-blue-600 hover:text-blue-800 font-medium"
                    >
                      {user.telegram_id}
                    </button>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {user.total_votes}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-green-600">
                    {user.approve_votes}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-red-600">
                    {user.reject_votes}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                      user.like_percentage >= 70 
                        ? 'bg-green-100 text-green-800' 
                        : user.like_percentage >= 50
                        ? 'bg-yellow-100 text-yellow-800'
                        : 'bg-red-100 text-red-800'
                    }`}>
                      {user.like_percentage}%
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                      user.agreement_with_responsible >= 70 
                        ? 'bg-green-100 text-green-800' 
                        : user.agreement_with_responsible >= 50
                        ? 'bg-yellow-100 text-yellow-800'
                        : user.agreement_with_responsible > 0
                        ? 'bg-red-100 text-red-800'
                        : 'bg-gray-100 text-gray-800'
                    }`}>
                      {user.agreement_with_responsible}%
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {user.responsible_votes_count}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Диаграмма распределения процента лайков */}
        <div className="bg-white p-6 rounded-lg shadow-sm border">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Распределение процента лайков по пользователям</h3>
          <ReactECharts 
          option={likePercentageDistributionOption} 
            style={{ height: '400px' }}
            opts={{ renderer: 'canvas' }}
          />
        </div>

      {/* График активности по минутам */}
        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <ReactECharts 
          option={votesByMinuteOption} 
            style={{ height: '400px' }}
            opts={{ renderer: 'canvas' }}
          />
      </div>

      {/* Круговая диаграмма участия пользователей */}
      <div className="bg-white p-6 rounded-lg shadow-sm border">
        <ReactECharts 
          option={userParticipationOption} 
          style={{ height: '400px' }}
          opts={{ renderer: 'canvas' }}
        />
      </div>

      {/* Дополнительная информация */}
      <div className="bg-white p-6 rounded-lg shadow-sm border">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Детальная статистика</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <h4 className="font-medium text-gray-900 mb-2">Средняя активность</h4>
            <p className="text-2xl font-bold text-blue-600">
              {Math.round(stats.total_votes / stats.votes_by_date.length)}
            </p>
            <p className="text-sm text-gray-600">голосов в день</p>
          </div>
          <div>
            <h4 className="font-medium text-gray-900 mb-2">Процент одобрения</h4>
            <p className="text-2xl font-bold text-green-600">
              {Math.round((stats.approved_votes / stats.total_votes) * 100)}%
            </p>
            <p className="text-sm text-gray-600">голосов одобрено</p>
          </div>
          <div>
            <h4 className="font-medium text-gray-900 mb-2">Уникальные голосующие</h4>
            <p className="text-2xl font-bold text-emerald-600">
              {stats.user_participation.find(u => u.user_type === 'Уникальные голосующие')?.count || 0}
            </p>
            <p className="text-sm text-gray-600">пользователей</p>
          </div>
        </div>
      </div>

      {/* Модальное окно с комментариями */}
      {showComments && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-11/12 md:w-3/4 lg:w-1/2 shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-medium text-gray-900">
                  Комментарии пользователя {selectedSurveyId}
                </h3>
                <button
                  onClick={() => setShowComments(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              
              <div className="max-h-96 overflow-y-auto">
                {surveyComments.length > 0 ? (
                  <div className="space-y-4">
                    {surveyComments.map((vote) => (
                      <div key={vote.id} className="border border-gray-200 rounded-lg p-4">
                        <div className="flex justify-between items-start mb-2">
                          <div className="flex items-center space-x-2">
                            <span className="text-sm font-medium text-gray-900">
                              Пользователь {vote.voter_telegram_id}
                            </span>
                            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                              vote.decision === 1 
                                ? 'bg-green-100 text-green-800' 
                                : 'bg-red-100 text-red-800'
                            }`}>
                              {vote.decision === 1 ? 'Одобрено' : 'Отклонено'}
                            </span>
                          </div>
                          <span className="text-xs text-gray-500">
                            {new Date(vote.created_at).toLocaleString('ru-RU')}
                          </span>
                        </div>
                        <p className="text-gray-700 text-sm">{vote.comment}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    <p>У этого пользователя нет комментариев</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;