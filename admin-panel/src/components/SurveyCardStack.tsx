import React, { useState, useRef, useEffect } from 'react';
import { Heart, HeartCrack, RotateCcw } from 'lucide-react';
import type { UserSurvey } from '../types';
import SurveyDisplay from './SurveyDisplay';

interface SurveyWithRating extends UserSurvey {
  isLiked?: boolean;
  isDisliked?: boolean;
  comment?: string;
}

interface SurveyCardStackProps {
  surveys: SurveyWithRating[];
  onRate: (surveyId: number, isLiked: boolean, comment?: string) => void;
  onSkip: (surveyId: number, comment?: string) => void;
}

const SurveyCardStack: React.FC<SurveyCardStackProps> = ({ surveys, onRate, onSkip }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [comment, setComment] = useState('');

  // Фильтруем только неоцененные анкеты
  const unratedSurveys = surveys.filter(survey => !survey.isLiked && !survey.isDisliked);
  const currentSurvey = unratedSurveys[currentIndex];
  const hasMoreSurveys = currentIndex < unratedSurveys.length - 1;

  // Сброс индекса при изменении данных
  useEffect(() => {
    if (currentIndex >= unratedSurveys.length && unratedSurveys.length > 0) {
      setCurrentIndex(0);
    }
  }, [unratedSurveys.length, currentIndex]);

  const handleLike = () => {
    if (currentSurvey) {
      onRate(currentSurvey.telegram_id, true, comment);
      setComment('');
      nextCard();
    }
  };

  const handleDislike = () => {
    if (currentSurvey) {
      onRate(currentSurvey.telegram_id, false, comment);
      setComment('');
      nextCard();
    }
  };

  const handleSkip = () => {
    if (currentSurvey) {
      onSkip(currentSurvey.telegram_id, comment);
      setComment('');
      nextCard();
    }
  };

  const nextCard = () => {
    if (hasMoreSurveys) {
      setCurrentIndex(prev => prev + 1);
    }
  };

  const resetStack = () => {
    setCurrentIndex(0);
  };

  if (!currentSurvey) {
    const message = surveys.length === 0 
      ? "Анкеты не найдены" 
      : "Все анкеты просмотрены!";
    const description = surveys.length === 0 
      ? "Загрузите данные анкет или проверьте подключение" 
      : "Вы оценили все доступные анкеты";
    
    return (
      <div className="flex flex-col items-center justify-center h-96 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
        <div className="text-center">
          <h3 className="text-xl font-semibold text-gray-600 mb-2">{message}</h3>
          <p className="text-gray-500 mb-4">{description}</p>
          {surveys.length > 0 && (
            <button
              onClick={resetStack}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <RotateCcw className="h-4 w-4" />
              Начать сначала
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Счетчик */}
      <div className="text-center mb-4">
        <span className="text-sm text-gray-600">
          {currentIndex + 1} из {unratedSurveys.length}
        </span>
      </div>

      {/* Стопка карточек */}
      <div className="relative h-[650px]">
        {/* Фоновые карточки для эффекта стопки */}
        {[1, 2].map((offset) => {
          const nextIndex = currentIndex + offset;
          if (nextIndex >= unratedSurveys.length) return null;
          
          return (
            <div
              key={`bg-${nextIndex}`}
              className="absolute inset-0"
              style={{
                transform: `scale(${1 - offset * 0.05}) translateY(${offset * 10}px)`,
                zIndex: 10 - offset,
                opacity: 1 - offset * 0.3
              }}
            />
          );
        })}

        {/* Основная карточка */}
        <div
          className="absolute inset-0 overflow-y-auto scrollbar-hide"
          style={{ zIndex: 20 }}
        >
          <SurveyDisplay survey={currentSurvey} />
        </div>
      </div>

      {/* Кнопки управления */}
      <div className="flex justify-center items-center gap-4 mt-6">
        <button
          onClick={handleDislike}
          className="flex items-center justify-center w-12 h-12 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors shadow-lg"
          title="Не нравится"
        >
          <HeartCrack className="h-6 w-6" />
        </button>
        
        <button
          onClick={handleSkip}
          className="flex items-center justify-center w-10 h-10 bg-gray-400 text-white rounded-full hover:bg-gray-500 transition-colors shadow-lg"
          title="Откат"
        >
          <RotateCcw className="h-5 w-5" />
        </button>
        
        <button
          onClick={handleLike}
          className="flex items-center justify-center w-12 h-12 bg-green-500 text-white rounded-full hover:bg-green-600 transition-colors shadow-lg"
          title="Нравится"
        >
          <Heart className="h-6 w-6" />
        </button>
      </div>

      {/* Поле для комментария */}
      <div className="mt-4 w-full">
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Комментарий..."
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
          rows={1}
        />
      </div>
    </>
  );
};

export default SurveyCardStack;
