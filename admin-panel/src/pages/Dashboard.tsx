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

const Dashboard: React.FC = () => {
  const [stats, setStats] = useState<SurveyStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Загружаем все голоса из API
      const response = await fetch('http://localhost.local:3000/votes');
      if (response.ok) {
        const votes: Vote[] = await response.json();
        
        // Анализируем данные на frontend
        const stats = analyzeVotes(votes);
        setStats(stats);
      } else {
        setError('Ошибка при загрузке данных голосования');
      }
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
    
    // Анализируем голоса по датам
    const votesByDate = new Map<string, { votes: number; approved: number; rejected: number }>();
    votes.forEach(vote => {
      const date = vote.created_at.split('T')[0]; // Получаем только дату
      if (!votesByDate.has(date)) {
        votesByDate.set(date, { votes: 0, approved: 0, rejected: 0 });
      }
      const dayStats = votesByDate.get(date)!;
      dayStats.votes++;
      if (vote.decision === 1) {
        dayStats.approved++;
      } else {
        dayStats.rejected++;
      }
    });
    
    const votes_by_date = Array.from(votesByDate.entries())
      .map(([date, stats]) => ({ date, ...stats }))
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

  // Конфигурация для графика голосов по анкетам
  const votesBySurveyOption = {
    title: {
      text: 'Голоса по анкетам',
      left: 'center',
      textStyle: {
        fontSize: 16,
        fontWeight: 'bold'
      }
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: {
        type: 'shadow'
      },
      formatter: function(params: any) {
        const data = params[0];
        const survey = stats.votes_by_survey[data.dataIndex];
        return `
          <div>
            <strong>Анкета ${survey.survey_id}</strong><br/>
            Всего голосов: ${survey.total_votes}<br/>
            Одобрено: ${survey.approved_votes}<br/>
            Отклонено: ${survey.rejected_votes}
        `;
      }
    },
    legend: {
      data: ['Всего голосов', 'Одобрено', 'Отклонено'],
      top: 30
    },
    xAxis: {
      type: 'category',
      data: stats.votes_by_survey.map(s => `Анкета ${s.survey_id}`),
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
        type: 'bar',
        data: stats.votes_by_survey.map(s => s.total_votes),
        itemStyle: { color: '#3B82F6' }
      },
      {
        name: 'Одобрено',
        type: 'bar',
        data: stats.votes_by_survey.map(s => s.approved_votes),
        itemStyle: { color: '#10B981' }
      },
      {
        name: 'Отклонено',
        type: 'bar',
        data: stats.votes_by_survey.map(s => s.rejected_votes),
        itemStyle: { color: '#EF4444' }
      }
    ]
  };

  // Конфигурация для графика голосов по датам
  const votesByDateOption = {
    title: {
      text: 'Активность голосования по дням',
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
        const dateData = stats.votes_by_date[data.dataIndex];
        return `
          <div>
            <strong>${data.axisValue}</strong><br/>
            Всего голосов: ${dateData.votes}<br/>
            Одобрено: ${dateData.approved}<br/>
            Отклонено: ${dateData.rejected}
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
        rotate: 45
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

      {/* Графики */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* График голосов по анкетам */}
        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <ReactECharts 
            option={votesBySurveyOption} 
            style={{ height: '400px' }}
            opts={{ renderer: 'canvas' }}
          />
        </div>

        {/* График активности по дням */}
        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <ReactECharts 
            option={votesByDateOption} 
            style={{ height: '400px' }}
            opts={{ renderer: 'canvas' }}
          />
        </div>
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
    </div>
  );
};

export default Dashboard;