import React, { useState, useEffect } from 'react';
import { Heart, HeartCrack, Users } from 'lucide-react';
import type { NextSurveyResponse, CreateVoteRequest, Vote } from '../types';
import SurveyDisplay from '../components/SurveyDisplay';
import { useAuth } from '../contexts/AuthContext';

const Surveys: React.FC = () => {
  const [loading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Состояния для системы голосования
  const [currentSurvey, setCurrentSurvey] = useState<NextSurveyResponse | null>(null);
  const [comment, setComment] = useState<string>('');
  const [surveyVotes, setSurveyVotes] = useState<Vote[]>([]);
  const [selectedDecision, setSelectedDecision] = useState<number | null>(null);
  
  // Состояния для информации о пользователях
  const [userInfo, setUserInfo] = useState<Record<number, any>>({});
  const [loadingUsers, setLoadingUsers] = useState<Set<number>>(new Set());
  
  const { userProfile, userRole } = useAuth();

  useEffect(() => {
    // Очищаем все состояния при инициализации
    setSurveyVotes([]);
    setSelectedDecision(null);
    setComment('');
    
    if (userProfile) {
      loadNextSurvey();
    }
  }, [userProfile, userRole]);

  // Функции для системы голосования

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

  const loadNextSurvey = async () => {
    if (!userProfile) {
      setError('Необходима авторизация');
      return;
    }

    // Очищаем предыдущие состояния
    setSurveyVotes([]);
    setSelectedDecision(null);
    setComment('');

    try {
      const response = await fetch(`/api/surveys/next?telegram_id=${userProfile.telegram_id}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (response.ok) {
        const nextSurvey: NextSurveyResponse = await response.json();
        setCurrentSurvey(nextSurvey);
        console.log('Загружена следующая анкета:', nextSurvey);
        
        // Если это ответственный пользователь и есть голоса, устанавливаем их
        if (userRole === 1 && nextSurvey.votes) {
          setSurveyVotes(nextSurvey.votes);
        }
      } else {
        setCurrentSurvey(null);
        setSurveyVotes([]);
        setSelectedDecision(null);
        setComment('');
      }
    } catch (err: any) {
      setError(err.message);
      setCurrentSurvey(null);
      setSurveyVotes([]);
      setSelectedDecision(null);
      setComment('');
    }
  };

  const selectDecision = (decision: number) => {
    setSelectedDecision(decision);
  };

  const confirmVote = async () => {
    console.log('confirmVote called:', { 
      surveyId: currentSurvey?.survey_id, 
      selectedDecision, 
      userProfile: !!userProfile,
      userProfileData: userProfile 
    });
    
    if (!currentSurvey?.survey_id || selectedDecision === null || !userProfile) {
      setError('Необходима авторизация или анкета не найдена');
      return;
    }


    try {
      const voteRequest: CreateVoteRequest = {
        survey_id: currentSurvey.survey_id,
        decision: selectedDecision,
        comment: comment.trim() || undefined
      };

      console.log('🗳️ Отправляем голос:', voteRequest);
      console.log('🔗 URL:', `/api/surveys/${currentSurvey.survey_id}/vote?telegram_id=${userProfile.telegram_id}`);

      const response = await fetch(`/api/surveys/${currentSurvey.survey_id}/vote?telegram_id=${userProfile.telegram_id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(voteRequest),
      });
      
      if (response.ok) {
        const result = await response.json();
        console.log('Голос отправлен:', result);
        // Очищаем состояние и загружаем следующую анкету
        setComment('');
        setSelectedDecision(null);
        await loadNextSurvey();
        
        // Прокручиваем экран вверх
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        throw new Error('Ошибка отправки голоса');
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  const cancelVote = () => {
    setSelectedDecision(null);
  };


  return (
    <div className="h-screen flex flex-col">
      {/* Загрузка и ошибки */}
      {loading && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-2 text-gray-600">Загрузка анкет...</p>
          </div>
        </div>
      )}

      {error && (
        <div className="flex-1 flex items-center justify-center">
          <div className="bg-red-50 border border-red-200 rounded-md p-4">
            <p className="text-red-700">{error}</p>
          </div>
        </div>
      )}

      {/* Контент */}
      {!loading && !error && (
        <>
          {currentSurvey && currentSurvey.survey_data ? (
            <>
              {/* Полноэкранная анкета */}
              <div className={`flex-1 p-6 transition-colors duration-500 ${
                selectedDecision === null 
                  ? 'bg-gray-50' 
                  : selectedDecision === 1 
                    ? 'bg-green-100' 
                    : 'bg-red-100'
              }`}>
                <SurveyDisplay survey={currentSurvey.survey_data} surveyId={currentSurvey.survey_id} />
              </div>
              
              {/* Блок с голосами для ответственных пользователей */}
              {userRole === 1 && surveyVotes.length > 0 && (() => {
                // Фильтруем голоса: исключаем собственную запись "В обработке"
                const filteredVotes = surveyVotes.filter(vote => 
                  !(vote.comment === 'В обработке' && vote.voter_telegram_id === userProfile?.telegram_id)
                );
                
                return (
                <div className={`border-t px-6 py-4 transition-colors duration-500 ${
                  selectedDecision === null 
                    ? 'bg-white border-gray-200' 
                    : selectedDecision === 1 
                      ? 'bg-green-100 border-green-300' 
                      : 'bg-red-100 border-red-300'
                }`}>
                  <h3 className="text-lg font-medium text-gray-900 flex items-center gap-2 mb-4">
                    <Users className="h-5 w-5" />
                    Голоса по анкете ({filteredVotes.length})
                  </h3>
                  
                  <div className="space-y-2">
                    {filteredVotes.map((vote) => (
                      <div key={vote.id} className="py-2 px-3 bg-gray-50 rounded-lg">
                        <div className="flex items-center gap-3 mb-2">
                          <button
                            onClick={() => loadUserInfo(vote.voter_telegram_id)}
                            className="font-mono text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline"
                            disabled={loadingUsers.has(vote.voter_telegram_id)}
                          >
                            {loadingUsers.has(vote.voter_telegram_id) ? 'Загрузка...' : vote.voter_telegram_id}
                          </button>
                          
                          {vote.comment === 'В обработке' ? (
                            <>
                              <span className="text-lg text-orange-600">⏳</span>
                              <span className="text-sm font-medium text-orange-600">
                                В обработке
                              </span>
                            </>
                          ) : (
                            <>
                              <span className={`text-lg ${vote.decision === 1 ? 'text-green-600' : 'text-red-600'}`}>
                                {vote.decision === 1 ? '✅' : '❌'}
                              </span>
                              
                              <span className={`text-sm font-medium ${
                                vote.decision === 1 ? 'text-green-600' : 'text-red-600'
                              }`}>
                                {vote.decision === 1 ? 'Одобрено' : 'Отклонено'}
                              </span>
                            </>
                          )}
                          
                          <span className="text-xs text-gray-500 ml-auto">
                            {(() => {
                              const date = new Date(vote.created_at);
                              // Добавляем 3 часа к UTC времени
                              const moscowTime = new Date(date.getTime() + (3 * 60 * 60 * 1000));
                              return moscowTime.toLocaleString('ru-RU', {
                                hour: '2-digit',
                                minute: '2-digit'
                              });
                            })()}
                          </span>
                        </div>
                        
                        {/* Информация о пользователе */}
                        {userInfo[vote.voter_telegram_id] && !userInfo[vote.voter_telegram_id].error && (
                          <div className="text-xs text-gray-600 mb-2 space-y-1">
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
                          <div className="text-xs text-red-500 mb-2">
                            {userInfo[vote.voter_telegram_id].error}
                          </div>
                        )}
                        
                        {vote.comment && vote.comment !== 'В обработке' && (
                          <div className="text-sm text-gray-600 break-words whitespace-pre-wrap">
                            "{vote.comment}"
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
                );
              })()}

              {/* Зафиксированные кнопки внизу */}
              <div className={`border-t border-gray-200 px-6 py-4 flex-shrink-0 transition-colors duration-500 ${
                selectedDecision === null 
                  ? 'bg-white' 
                  : selectedDecision === 1 
                    ? 'bg-green-200' 
                    : 'bg-red-200'
              }`}>
                <div className="space-y-4">
                  {/* Поле комментария */}
                  <div>
                    <label htmlFor="comment" className="block text-sm font-medium text-gray-700 mb-2">
                      Комментарий к решению
                    </label>
                    <textarea
                      id="comment"
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      placeholder=""
                      className={`w-full px-3 py-2 border-2 rounded-md focus:outline-none focus:ring-2 resize-none transition-colors duration-300 ${
                        selectedDecision === null 
                          ? 'border-gray-300 focus:ring-blue-500 focus:border-blue-500' 
                          : selectedDecision === 1 
                            ? 'border-green-400 focus:ring-green-500 focus:border-green-500' 
                            : 'border-red-400 focus:ring-red-500 focus:border-red-500'
                      }`}
                      rows={3}
                    />
                  </div>
                  
                  {/* Кнопки */}
                  <div className="flex justify-center gap-8">
                    {selectedDecision === null ? (
                      <>
                        <button
                          onClick={() => selectDecision(0)}
                          className="flex items-center justify-center w-16 h-12 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                        >
                          <HeartCrack className="h-6 w-6" />
                        </button>
                        <button
                          onClick={() => selectDecision(1)}
                          className="flex items-center justify-center w-16 h-12 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                        >
                          <Heart className="h-6 w-6" />
                        </button>
                      </>
                    ) : (
                      <div className="flex flex-col items-center gap-4">
                        {/* Кнопки подтверждения */}
                        <div className="flex gap-4">
                          <button
                            onClick={confirmVote}
                            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                          >
                            Подтвердить
                          </button>
                          <button
                            onClick={cancelVote}
                            className="px-6 py-3 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors"
                          >
                            Отмена
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
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
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default Surveys;