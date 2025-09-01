import React from 'react';
import type { UserSurvey } from '../types';
import DrawingRenderer from './DrawingRenderer';

interface SurveyDisplayProps {
  survey: UserSurvey;
}

// Функция для отображения текста с переносами строк
const formatTextWithLineBreaks = (text: string) => {
  return text.split('\n').map((line, index) => (
    <React.Fragment key={index}>
      {line}
      {index < text.split('\n').length - 1 && <br />}
    </React.Fragment>
  ));
};

const SurveyDisplay: React.FC<SurveyDisplayProps> = ({ survey }) => {
  return (
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
            <p className="text-base text-gray-900 font-medium text-left">{formatTextWithLineBreaks(survey.survey_data.q1)}</p>
          )}
        </div>

        {/* Вопрос 2 - множественный выбор */}
        <div className="space-y-1">
          <p className={`text-sm ${(survey.skills && survey.skills.length > 0) ? 'text-gray-600' : 'text-red-600'} text-left`}>2. Чем ты занимался(-ась) в школе?</p>
          {survey.skills && survey.skills.length > 0 && (
            <div className="space-y-1">
              {survey.skills.map((skill, index) => (
                <p key={index} className="text-base text-gray-900 font-medium text-left">
                  • {formatTextWithLineBreaks(skill)}
                </p>
              ))}
            </div>
          )}
        </div>

        {/* Вопрос 3 */}
        <div className="space-y-1">
          <p className={`text-sm ${(survey.interests && survey.interests[0]) ? 'text-gray-600' : 'text-red-600'} text-left`}>3. Какое твое самое большое достижение в жизни, не связанное с учебой?</p>
          {survey.interests && survey.interests[0] && (
            <p className="text-base text-gray-900 font-medium text-left">{formatTextWithLineBreaks(survey.interests[0])}</p>
          )}
        </div>

        {/* Вопрос 4 */}
        <div className="space-y-1">
          <p className={`text-sm ${(survey.interests && survey.interests[1]) ? 'text-gray-600' : 'text-red-600'} text-left`}>4. Охарактеризуй себя 3 словами, которые начинаются на эти буквы: Ч, У, Г</p>
          {survey.interests && survey.interests[1] && (
            <p className="text-base text-gray-900 font-medium text-left">{formatTextWithLineBreaks(survey.interests[1])}</p>
          )}
        </div>

        {/* Вопрос 5 */}
        <div className="space-y-1">
          <p className={`text-sm ${survey.q5 ? 'text-gray-600' : 'text-red-600'} text-left`}>5. Какое качество ты бы хотел(-а) в себе развить или улучшить и почему?</p>
          {survey.q5 && (
            <p className="text-base text-gray-900 font-medium text-left">{formatTextWithLineBreaks(survey.q5)}</p>
          )}
        </div>

        {/* Вопрос 6 */}
        <div className="space-y-1">
          <p className={`text-sm ${survey.q6 ? 'text-gray-600' : 'text-red-600'} text-left`}>6. Чем ты можешь вдохновить других людей?</p>
          {survey.q6 && (
            <p className="text-base text-gray-900 font-medium text-left">{formatTextWithLineBreaks(survey.q6)}</p>
          )}
        </div>

        {/* Вопрос 7 */}
        <div className="space-y-1">
          <p className={`text-sm ${survey.q7 ? 'text-gray-600' : 'text-red-600'} text-left`}>7. Если бы в Вышке была студенческая организация твоей мечты — чем бы она занималась?</p>
          {survey.q7 && (
            <p className="text-base text-gray-900 font-medium text-left">{formatTextWithLineBreaks(survey.q7)}</p>
          )}
        </div>

        {/* Вопрос 8 */}
        <div className="space-y-1">
          <p className={`text-sm ${survey.q8 ? 'text-gray-600' : 'text-red-600'} text-left`}>8. Как ты думаешь, что будет в Школе Актива?</p>
          {survey.q8 && (
            <p className="text-base text-gray-900 font-medium text-left">{formatTextWithLineBreaks(survey.q8)}</p>
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
                      console.log('Drawing data for user', survey.full_name, ':', drawingData);
                      console.log('Text elements:', drawingData?.textElements);
                      console.log('Drawing strokes:', drawingData?.drawingData?.length);
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
  );
};

export default SurveyDisplay;
