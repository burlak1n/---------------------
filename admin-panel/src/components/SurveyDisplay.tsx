import React from 'react';
import type { UserSurvey } from '../types';
import DrawingRenderer from './DrawingRenderer';

interface SurveyDisplayProps {
  survey: UserSurvey;
  surveyId?: number;
}

// Функция для отображения текста с переносами строк и обработкой ссылок
const formatTextWithLineBreaks = (text: string) => {
  return text.split('\n').map((line, index) => (
    <React.Fragment key={index}>
      <span className="break-words whitespace-pre-wrap">{line}</span>
      {index < text.split('\n').length - 1 && <br />}
    </React.Fragment>
  ));
};

const SurveyDisplay: React.FC<SurveyDisplayProps> = ({ survey, surveyId }) => {
  // Извлекаем данные анкеты из нового формата
  const surveyData = survey.data || survey;
  const completionTime = survey.completion_time_seconds;
  const createdAt = survey.completed_at;
  
  return (
    <div className="space-y-4 text-left">
      {/* Заголовок и время */}
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-xl font-bold text-gray-900">{surveyData.full_name || survey.full_name}</h3>
          <div className="text-sm text-gray-600 mt-1">
            {surveyData.faculty || survey.faculty} • {surveyData.group || survey.group}
          </div>
          <div className="text-sm text-gray-600 mt-1">
            <a href={`https://t.me/${survey.username}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
              @{survey.username}
            </a>
            {' • '}
            <a href={`tel:${surveyData.phone || survey.phone}`} className="text-blue-600 hover:underline">
              {surveyData.phone || survey.phone}
            </a>
          </div>
          <div className="text-xs text-gray-500 mt-1 font-mono">
            ID: {surveyId || survey.telegram_id}
          </div>
        </div>
        <div className="text-sm text-gray-600 text-right">
          <div>{new Date(createdAt).toLocaleDateString('ru-RU', { 
            day: '2-digit', 
            month: '2-digit', 
            year: '2-digit' 
          })} {new Date(createdAt).toLocaleTimeString('ru-RU', { 
            hour: '2-digit', 
            minute: '2-digit' 
          })}</div>
          {completionTime && (
            <div className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs font-medium">
              {Math.floor(completionTime / 60)}:{String(completionTime % 60).padStart(2, '0')}
            </div>
          )}
        </div>
      </div>
      
      {/* Вопросы */}
      <div className="space-y-4">
        {/* Вопрос 1 */}
        <div>
          <p className={`text-sm ${surveyData.q1 ? 'text-gray-600' : 'text-red-600'}`}>1. Если бы ты был мемом, то каким?</p>
          {surveyData.q1 && (
            <p className="text-base text-gray-900 font-medium mt-1">{formatTextWithLineBreaks(surveyData.q1)}</p>
          )}
        </div>

        {/* Вопрос 2 - множественный выбор */}
        <div>
          <p className={`text-sm ${(surveyData.q2 && surveyData.q2.length > 0) ? 'text-gray-600' : 'text-red-600'}`}>2. Чем ты занимался(-ась) в школе?</p>
          {surveyData.q2 && surveyData.q2.length > 0 && (
            <div className="mt-1">
              {surveyData.q2.map((skill, index) => (
                <p key={index} className="text-base text-gray-900 font-medium">
                  • {formatTextWithLineBreaks(skill)}
                </p>
              ))}
            </div>
          )}
        </div>

        {/* Вопрос 3 */}
        <div>
          <p className={`text-sm ${surveyData.q3 ? 'text-gray-600' : 'text-red-600'}`}>3. Какое твое самое большое достижение в жизни, не связанное с учебой?</p>
          {surveyData.q3 && (
            <p className="text-base text-gray-900 font-medium mt-1">{formatTextWithLineBreaks(surveyData.q3)}</p>
          )}
        </div>

        {/* Вопрос 4 */}
        <div>
          <p className={`text-sm ${surveyData.q4 ? 'text-gray-600' : 'text-red-600'}`}>4. Охарактеризуй себя 3 словами, которые начинаются на эти буквы: Ч, У, Г</p>
          {surveyData.q4 && (
            <p className="text-base text-gray-900 font-medium mt-1">{formatTextWithLineBreaks(surveyData.q4)}</p>
          )}
        </div>

        {/* Вопрос 5 */}
        <div>
          <p className={`text-sm ${surveyData.q5 ? 'text-gray-600' : 'text-red-600'}`}>5. Какое качество ты бы хотел(-а) в себе развить или улучшить и почему?</p>
          {surveyData.q5 && (
            <p className="text-base text-gray-900 font-medium mt-1">{formatTextWithLineBreaks(surveyData.q5)}</p>
          )}
        </div>

        {/* Вопрос 6 */}
        <div>
          <p className={`text-sm ${surveyData.q6 ? 'text-gray-600' : 'text-red-600'}`}>6. Чем ты можешь вдохновить других людей?</p>
          {surveyData.q6 && (
            <p className="text-base text-gray-900 font-medium mt-1">{formatTextWithLineBreaks(surveyData.q6)}</p>
          )}
        </div>

        {/* Вопрос 7 */}
        <div>
          <p className={`text-sm ${surveyData.q7 ? 'text-gray-600' : 'text-red-600'}`}>7. Если бы в Вышке была студенческая организация твоей мечты — чем бы она занималась?</p>
          {surveyData.q7 && (
            <p className="text-base text-gray-900 font-medium mt-1">{formatTextWithLineBreaks(surveyData.q7)}</p>
          )}
        </div>

        {/* Вопрос 8 */}
        <div>
          <p className={`text-sm ${surveyData.q8 ? 'text-gray-600' : 'text-red-600'}`}>8. Как ты думаешь, что будет в Школе Актива?</p>
          {surveyData.q8 && (
            <p className="text-base text-gray-900 font-medium mt-1">{formatTextWithLineBreaks(surveyData.q8)}</p>
          )}
        </div>

        {/* Вопрос 9 - творческое задание */}
        <div>
          {(() => {
            // Проверяем, есть ли реальное содержимое в q9
            let hasContent = false;
            try {
              if (surveyData.q9) {
                const drawingData = typeof surveyData.q9 === 'string' ? JSON.parse(surveyData.q9) : surveyData.q9;
                hasContent = (drawingData?.drawingData && drawingData.drawingData.length > 0) || 
                            (drawingData?.textElements && drawingData.textElements.length > 0);
              }
            } catch (error) {
              hasContent = false;
            }
            
            return (
              <>
                <p className={`text-sm ${hasContent ? 'text-gray-600' : 'text-red-600'}`}>9. Заинтересуй проверяющего (Напиши, нарисуй, удиви в любом формате!)</p>
                {/* Блок для рисунка/творческого задания */}
                <div className="mt-1">
                  {(() => {
                    try {
                      if (!surveyData.q9 || !hasContent) {
                        return (
                          <div className="bg-white border-2 border-red-300 rounded-lg" style={{ width: 300, height: 200 }} />
                        );
                      }
                      const raw: any = surveyData.q9 as any;
                      const drawingData = typeof raw === 'string' ? JSON.parse(raw) : raw;
                      console.log('Drawing data for user', surveyData.full_name || survey.full_name, ':', drawingData);
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
