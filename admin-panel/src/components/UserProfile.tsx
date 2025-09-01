import React, { useState, useEffect } from 'react';
import { X, AlertCircle } from 'lucide-react';
import { externalUsersApi } from '../api';
import type { UserSurvey } from '../types';
import DrawingRenderer from './DrawingRenderer';

interface UserProfileProps {
  telegramId: number;
  isOpen: boolean;
  onClose: () => void;
}

const UserProfile: React.FC<UserProfileProps> = ({ telegramId, isOpen, onClose }) => {
  const [survey, setSurvey] = useState<UserSurvey | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && telegramId) {
      loadUserSurvey();
    }
  }, [isOpen, telegramId]);

  const loadUserSurvey = async () => {
    setLoading(true);
    setError(null);
    try {
      const userSurvey = await externalUsersApi.getUserSurvey(telegramId);
      setSurvey(userSurvey);
    } catch (err: any) {
      setError(err.message);
      console.error('Error loading user survey:', err);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">Профиль пользователя</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {loading && (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
              <p className="mt-2 text-gray-600">Загрузка профиля...</p>
            </div>
          )}

          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-md">
              <div className="flex items-center">
                <AlertCircle className="h-5 w-5 text-red-500 mr-2" />
                <span className="text-red-700">{error}</span>
              </div>
            </div>
          )}

          {survey && (
            <div className="space-y-6">
              {/* Основная информация */}
              <div className="bg-white border border-gray-200 rounded-lg p-3 pl-2 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-lg font-semibold text-gray-900">{survey.full_name}</h3>
                  <div className="text-xs text-gray-400 space-x-2">
                    <span>ID: {survey.telegram_id}</span>
                  </div>
                </div>
                <div className="space-y-2 text-sm text-gray-600">
                  <div><span className="text-gray-500 font-medium">Факультет:</span> {survey.faculty}</div>
                  <div><span className="text-gray-500 font-medium">Группа:</span> {survey.group}</div>
                  <div className="flex flex-wrap gap-4">
                    <a 
                      href={`tel:${survey.phone}`} 
                      className="text-blue-600 hover:text-blue-800 hover:underline transition-colors"
                    >
                      {survey.phone}
                    </a>
                    {survey.email && (
                      <>
                        <span>•</span>
                        <span>{survey.email}</span>
                      </>
                    )}
                    {survey.username && (
                      <>
                        <span>•</span>
                        <a 
                          href={`https://t.me/${survey.username}`} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:text-blue-800 hover:underline transition-colors"
                        >
                          @{survey.username}
                        </a>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Анкета в стиле изображения */}
              <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm">
                <div className="mb-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xl font-bold text-gray-900 mb-2 text-left">Анкета</h3>
                    <div className="text-sm text-gray-600 text-left">
                      Завершена {new Date(survey.completed_at).toLocaleDateString('ru-RU')} в {new Date(survey.completed_at).toLocaleTimeString('ru-RU', { 
                        hour: '2-digit', 
                        minute: '2-digit' 
                      })}
                      {survey.survey_data?.completion_time_seconds && (
                        <span className="ml-3">
                          • Время заполнения: {Math.floor(survey.survey_data.completion_time_seconds / 60)} мин {survey.survey_data.completion_time_seconds % 60} сек
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                
                <div className="space-y-3">
                  {/* Вопрос 1 */}
                  <div className="space-y-1">
                    <p className={`text-sm ${survey.survey_data?.q1 ? 'text-gray-600' : 'text-red-600'} text-left`}>1. Если бы ты был мемом, то каким?</p>
                    {survey.survey_data?.q1 && (
                      <p className="text-base text-gray-900 font-medium text-left">{survey.survey_data.q1}</p>
                    )}
                  </div>

                  {/* Вопрос 2 - множественный выбор */}
                  <div className="space-y-1">
                    <p className={`text-sm ${(survey.skills && survey.skills.length > 0) ? 'text-gray-600' : 'text-red-600'} text-left`}>2. Чем ты занимался(-ась) в школе?</p>
                    {survey.skills && survey.skills.length > 0 && (
                      <div className="space-y-1">
                        {survey.skills.map((skill, index) => (
                          <p key={index} className="text-base text-gray-900 font-medium text-left">
                            • {skill}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Вопрос 3 */}
                  <div className="space-y-1">
                    <p className={`text-sm ${(survey.interests && survey.interests[0]) ? 'text-gray-600' : 'text-red-600'} text-left`}>3. Какое твое самое большое достижение в жизни, не связанное с учебой?</p>
                    {survey.interests && survey.interests[0] && (
                      <p className="text-base text-gray-900 font-medium text-left">{survey.interests[0]}</p>
                    )}
                  </div>

                  {/* Вопрос 4 */}
                  <div className="space-y-1">
                    <p className={`text-sm ${(survey.interests && survey.interests[1]) ? 'text-gray-600' : 'text-red-600'} text-left`}>4. Охарактеризуй себя 3 словами, которые начинаются на эти буквы: Ч, У, Г</p>
                    {survey.interests && survey.interests[1] && (
                      <p className="text-base text-gray-900 font-medium text-left">{survey.interests[1]}</p>
                    )}
                  </div>

                  {/* Вопрос 5 */}
                  <div className="space-y-1">
                    <p className={`text-sm ${survey.q5 ? 'text-gray-600' : 'text-red-600'} text-left`}>5. Какое качество ты бы хотел(-а) в себе развить или улучшить и почему?</p>
                    {survey.q5 && (
                      <p className="text-base text-gray-900 font-medium text-left">{survey.q5}</p>
                    )}
                  </div>

                  {/* Вопрос 6 */}
                  <div className="space-y-1">
                    <p className={`text-sm ${survey.q6 ? 'text-gray-600' : 'text-red-600'} text-left`}>6. Чем ты можешь вдохновить других людей?</p>
                    {survey.q6 && (
                      <p className="text-base text-gray-900 font-medium text-left">{survey.q6}</p>
                    )}
                  </div>

                  {/* Вопрос 7 */}
                  <div className="space-y-1">
                    <p className={`text-sm ${survey.q7 ? 'text-gray-600' : 'text-red-600'} text-left`}>7. Если бы в Вышке была студенческая организация твоей мечты — чем бы она занималась?</p>
                    {survey.q7 && (
                      <p className="text-base text-gray-900 font-medium text-left">{survey.q7}</p>
                    )}
                  </div>

                  {/* Вопрос 8 */}
                  <div className="space-y-1">
                    <p className={`text-sm ${survey.q8 ? 'text-gray-600' : 'text-red-600'} text-left`}>8. Как ты думаешь, что будет в Школе Актива?</p>
                    {survey.q8 && (
                      <p className="text-base text-gray-900 font-medium text-left">{survey.q8}</p>
                    )}
                  </div>

                  {/* Вопрос 9 - творческое задание */}
                  <div className="space-y-3">
                    {(() => {
                      // Проверяем, есть ли реальное содержимое в q9
                      let hasContent = false;
                      try {
                        if (survey.q9) {
                          const drawingData = typeof survey.q9 === 'string' ? JSON.parse(survey.q9) : survey.q9;
                          hasContent = (drawingData?.drawingData && drawingData.drawingData.length > 0) || 
                                      (drawingData?.textElements && drawingData.textElements.length > 0);
                        }
                      } catch (error) {
                        hasContent = false;
                      }
                      
                      return (
                        <>
                          <p className={`text-sm ${hasContent ? 'text-gray-600' : 'text-red-600'} text-left`}>9. Заинтересуй проверяющего (Напиши, нарисуй, удиви в любом формате!)</p>
                          {/* Блок для рисунка/творческого задания */}
                          <div className="text-left">
                            {(() => {
                              try {
                                if (!survey.q9 || !hasContent) {
                                  return (
                                    <div className="bg-white border-2 border-red-300 rounded-lg" style={{ width: 300, height: 200 }} />
                                  );
                                }
                                const raw: any = survey.q9 as any;
                                const drawingData = typeof raw === 'string' ? JSON.parse(raw) : raw;
                                return (
                                  <DrawingRenderer
                                    drawingData={drawingData}
                                    width={300}
                                    height={200}
                                  />
                                );
                              } catch (error) {
                                return (
                                  <div className="bg-white border-2 border-red-300 rounded-lg" style={{ width: 300, height: 200 }} />
                                );
                              }
                            })()}
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end p-6 border-t border-gray-200">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors"
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
};

export default UserProfile;

