import React, { useState, useEffect } from 'react';
import { Heart, HeartOff } from 'lucide-react';
import type { NextSurveyResponse, CreateVoteRequest } from '../types';
import SurveyDisplay from '../components/SurveyDisplay';
import { useAuth } from '../contexts/AuthContext';

const Surveys: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Состояния для системы голосования
  const [currentSurvey, setCurrentSurvey] = useState<NextSurveyResponse | null>(null);
  
  const { userProfile, userRole } = useAuth();

  useEffect(() => {
    if (userProfile) {
      loadNextSurvey();
    }
  }, [userProfile]);

  // Функции для системы голосования

  const loadNextSurvey = async () => {
    if (!userProfile) {
      setError('Необходима авторизация');
      return;
    }

    try {
      const response = await fetch(`http://localhost.local:3000/surveys/next?telegram_id=${userProfile.telegram_id}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (response.ok) {
        const nextSurvey: NextSurveyResponse = await response.json();
        setCurrentSurvey(nextSurvey);
        console.log('Загружена следующая анкета:', nextSurvey);
      } else {
        setCurrentSurvey(null);
      }
    } catch (err: any) {
      setError(err.message);
      setCurrentSurvey(null);
    }
  };

  const submitVote = async (surveyId: number, decision: number, comment?: string) => {
    if (!userProfile) {
      setError('Необходима авторизация');
      return;
    }

    try {
      const voteRequest: CreateVoteRequest = {
        survey_id: surveyId,
        decision,
        comment
      };

      const response = await fetch(`http://localhost.local:3000/surveys/${surveyId}/vote?telegram_id=${userProfile.telegram_id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(voteRequest),
      });
      
      if (response.ok) {
        const result = await response.json();
        console.log('Голос отправлен:', result);
        // Загружаем следующую анкету
        await loadNextSurvey();
      } else {
        throw new Error('Ошибка отправки голоса');
      }
    } catch (err: any) {
      setError(err.message);
    }
  };


  return (
    <div className="space-y-6">

      {/* Загрузка и ошибки */}
      {loading && (
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-2 text-gray-600">Загрузка анкет...</p>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <p className="text-red-700">{error}</p>
        </div>
      )}

      {/* Контент */}
      {!loading && !error && (
        <>
          {currentSurvey && currentSurvey.survey_data ? (
            <div className="bg-white rounded-lg shadow-sm border p-6">
              <div className="mb-4">
                <h2 className="text-xl font-semibold text-gray-900 mb-2">
                  Анкета для голосования
                </h2>
                {currentSurvey.vote_summary && (
                  <div className="text-sm text-gray-600 mb-4">
                    Статус: {currentSurvey.vote_summary.status} | 
                    Голосов: {currentSurvey.vote_summary.total_votes} | 
                    За: {currentSurvey.vote_summary.approve_votes} | 
                    Против: {currentSurvey.vote_summary.reject_votes}
                  </div>
                )}
                </div>
              
              <SurveyDisplay survey={currentSurvey.survey_data} />
              
              <div className="mt-6 flex justify-center gap-4">
                <button
                  onClick={() => submitVote(currentSurvey.survey_id!, 0)}
                  className="flex items-center gap-2 px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                >
                  <HeartOff className="h-5 w-5" />
                  Отклонить
                </button>
                <button
                  onClick={() => submitVote(currentSurvey.survey_id!, 1)}
                  className="flex items-center gap-2 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                >
                  <Heart className="h-5 w-5" />
                  Одобрить
                </button>
              </div>
            </div>
          ) : (
            <div className="text-center py-12">
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Нет анкет для голосования
              </h3>
              <p className="text-gray-600 mb-4">
                {userRole === 1 
                  ? 'Нет анкет, готовых для финального решения'
                  : 'Нет анкет, ожидающих вашей оценки'
                }
              </p>
              <button
                onClick={loadNextSurvey}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
              >
                Обновить
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default Surveys;