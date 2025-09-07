import React, { useState, useEffect } from 'react';
import { Edit, Trash2, Save, X, Eye, EyeOff, Search, List } from 'lucide-react';
import { votesApi } from '../api';
import type { Vote, CreateVoteRequest } from '../types';
import SurveyQueue from '../components/SurveyQueue';

const Votes: React.FC = () => {
  const [votes, setVotes] = useState<Vote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingVote, setEditingVote] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<Partial<CreateVoteRequest>>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [filterDecision, setFilterDecision] = useState<'all' | 'approve' | 'reject'>('all');
  const [showComments, setShowComments] = useState<Set<number>>(new Set());
  const [activeTab, setActiveTab] = useState<'queue' | 'table'>('queue');

  useEffect(() => {
    loadVotes();
  }, []);

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

  const handleEdit = (vote: Vote) => {
    setEditingVote(vote.id);
    setEditForm({
      decision: vote.decision,
      comment: vote.comment || ''
    });
  };

  const handleSave = async (voteId: number) => {
    try {
      await votesApi.update(voteId, editForm);
      await loadVotes();
      setEditingVote(null);
      setEditForm({});
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleCancel = () => {
    setEditingVote(null);
    setEditForm({});
  };

  const handleDelete = async (voteId: number) => {
    if (window.confirm('Вы уверены, что хотите удалить этот голос?')) {
      try {
        await votesApi.delete(voteId);
        await loadVotes();
      } catch (err: any) {
        setError(err.message);
      }
    }
  };

  const toggleComment = (voteId: number) => {
    const newShowComments = new Set(showComments);
    if (newShowComments.has(voteId)) {
      newShowComments.delete(voteId);
    } else {
      newShowComments.add(voteId);
    }
    setShowComments(newShowComments);
  };

  const filteredVotes = votes.filter(vote => {
    const matchesSearch = vote.survey_id.toString().includes(searchTerm) ||
                         vote.voter_telegram_id.toString().includes(searchTerm) ||
                         (vote.comment && vote.comment.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const matchesFilter = filterDecision === 'all' ||
                         (filterDecision === 'approve' && vote.decision === 1) ||
                         (filterDecision === 'reject' && vote.decision === 0);
    
    return matchesSearch && matchesFilter;
  });

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    // Добавляем 3 часа к UTC времени
    const moscowTime = new Date(date.getTime() + (3 * 60 * 60 * 1000));
    return moscowTime.toLocaleString('ru-RU', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getDecisionText = (decision: number) => {
    return decision === 1 ? 'Одобрено' : 'Отклонено';
  };

  const getDecisionColor = (decision: number) => {
    return decision === 1 ? 'text-green-600 bg-green-50' : 'text-red-600 bg-red-50';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-2 text-gray-600">Загрузка голосов...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">Управление голосами</h1>
        <button
          onClick={loadVotes}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
        >
          Обновить
        </button>
      </div>

      {/* Вкладки */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('queue')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'queue'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <div className="flex items-center gap-2">
              <List className="h-4 w-4" />
              Очередь анкет
            </div>
          </button>
          <button
            onClick={() => setActiveTab('table')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'table'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <div className="flex items-center gap-2">
              <Search className="h-4 w-4" />
              Таблица голосов
            </div>
          </button>
        </nav>
      </div>

      {/* Контент вкладок */}
      {activeTab === 'queue' ? (
        <SurveyQueue onRefresh={loadVotes} />
      ) : (
        <div className="space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-4">
              <p className="text-red-700">{error}</p>
            </div>
          )}

          {/* Фильтры и поиск */}
          <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Поиск
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="По ID анкеты, голосующего или комментарию..."
                    className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Решение
                </label>
                <select
                  value={filterDecision}
                  onChange={(e) => setFilterDecision(e.target.value as 'all' | 'approve' | 'reject')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="all">Все</option>
                  <option value="approve">Одобрено</option>
                  <option value="reject">Отклонено</option>
                </select>
              </div>
            </div>
          </div>

          {/* Статистика */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
              <div className="text-sm font-medium text-gray-500">Всего голосов</div>
              <div className="text-2xl font-bold text-gray-900">{votes.length}</div>
            </div>
            <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
              <div className="text-sm font-medium text-gray-500">Одобрено</div>
              <div className="text-2xl font-bold text-green-600">
                {votes.filter(v => v.decision === 1).length}
              </div>
            </div>
            <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
              <div className="text-sm font-medium text-gray-500">Отклонено</div>
              <div className="text-2xl font-bold text-red-600">
                {votes.filter(v => v.decision === 0).length}
              </div>
            </div>
          </div>

          {/* Таблица голосов */}
          <div className="bg-white shadow-sm rounded-lg border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      ID
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Анкета
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Голосующий
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Решение
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Комментарий
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Время
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Действия
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredVotes.map((vote) => (
                    <tr key={vote.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {vote.id}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {vote.survey_id}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {vote.voter_telegram_id}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {editingVote === vote.id ? (
                          <select
                            value={editForm.decision}
                            onChange={(e) => setEditForm({...editForm, decision: parseInt(e.target.value)})}
                            className="px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            <option value={1}>Одобрено</option>
                            <option value={0}>Отклонено</option>
                          </select>
                        ) : (
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getDecisionColor(vote.decision)}`}>
                            {getDecisionText(vote.decision)}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        {editingVote === vote.id ? (
                          <textarea
                            value={editForm.comment || ''}
                            onChange={(e) => setEditForm({...editForm, comment: e.target.value})}
                            className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                            rows={2}
                            placeholder="Комментарий..."
                          />
                        ) : vote.comment ? (
                          <div className="max-w-xs">
                            <div className="flex items-center gap-2">
                              <span className={`truncate ${showComments.has(vote.id) ? '' : 'max-w-20'}`}>
                                {showComments.has(vote.id) ? vote.comment : `${vote.comment.substring(0, 20)}...`}
                              </span>
                              <button
                                onClick={() => toggleComment(vote.id)}
                                className="text-gray-400 hover:text-gray-600"
                              >
                                {showComments.has(vote.id) ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatDate(vote.created_at)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        {editingVote === vote.id ? (
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleSave(vote.id)}
                              className="text-green-600 hover:text-green-900"
                            >
                              <Save className="h-4 w-4" />
                            </button>
                            <button
                              onClick={handleCancel}
                              className="text-gray-400 hover:text-gray-600"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleEdit(vote)}
                              className="text-blue-600 hover:text-blue-900"
                            >
                              <Edit className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleDelete(vote.id)}
                              className="text-red-600 hover:text-red-900"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            {filteredVotes.length === 0 && (
              <div className="text-center py-8 text-gray-500">
                {votes.length === 0 ? 'Голосов не найдено' : 'Нет голосов, соответствующих фильтрам'}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Votes;