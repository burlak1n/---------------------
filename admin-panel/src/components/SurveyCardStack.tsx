import React, { useState, useRef, useEffect } from 'react';
import { Heart, HeartOff, X, RotateCcw } from 'lucide-react';
import type { UserSurvey } from '../types';
import SurveyDisplay from './SurveyDisplay';

interface SurveyWithRating extends UserSurvey {
  isLiked?: boolean;
  isDisliked?: boolean;
}

interface SurveyCardStackProps {
  surveys: SurveyWithRating[];
  onRate: (surveyId: number, isLiked: boolean) => void;
  onSkip: (surveyId: number) => void;
}

const SurveyCardStack: React.FC<SurveyCardStackProps> = ({ surveys, onRate, onSkip }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartPos, setDragStartPos] = useState({ x: 0, y: 0 });
  const cardRef = useRef<HTMLDivElement>(null);

  // Фильтруем только неоцененные анкеты
  const unratedSurveys = surveys.filter(survey => !survey.isLiked && !survey.isDisliked);
  const currentSurvey = unratedSurveys[currentIndex];
  const hasMoreSurveys = currentIndex < unratedSurveys.length - 1;

  // console.log('SurveyCardStack:', { 
  //   totalSurveys: surveys.length, 
  //   unratedSurveys: unratedSurveys.length, 
  //   currentIndex, 
  //   currentSurvey: currentSurvey?.full_name 
  // });

  // Сброс индекса при изменении данных
  useEffect(() => {
    if (currentIndex >= unratedSurveys.length && unratedSurveys.length > 0) {
      setCurrentIndex(0);
    }
  }, [unratedSurveys.length, currentIndex]);

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStartPos({ x: e.clientX, y: e.clientY });
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging) return;
    
    const deltaX = e.clientX - dragStartPos.x;
    const deltaY = e.clientY - dragStartPos.y;
    setDragOffset({ x: deltaX, y: deltaY });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);

    // Определяем направление свайпа
    const threshold = 100;
    if (Math.abs(dragOffset.x) > threshold) {
      if (dragOffset.x > 0) {
        handleLike();
      } else {
        handleDislike();
      }
    } else {
      // Возвращаем карточку на место
      setDragOffset({ x: 0, y: 0 });
    }
  };

  const handleLike = () => {
    if (currentSurvey) {
      onRate(currentSurvey.telegram_id, true);
      nextCard();
    }
  };

  const handleDislike = () => {
    if (currentSurvey) {
      onRate(currentSurvey.telegram_id, false);
      nextCard();
    }
  };

  const handleSkip = () => {
    if (currentSurvey) {
      onSkip(currentSurvey.telegram_id);
      nextCard();
    }
  };

  const nextCard = () => {
    setDragOffset({ x: 0, y: 0 });
    if (hasMoreSurveys) {
      setCurrentIndex(prev => prev + 1);
    }
  };

  const resetStack = () => {
    setCurrentIndex(0);
    setDragOffset({ x: 0, y: 0 });
  };

  useEffect(() => {
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

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

  const cardStyle = {
    transform: `translate(${dragOffset.x}px, ${dragOffset.y}px) rotate(${dragOffset.x * 0.1}deg)`,
    opacity: isDragging ? 0.9 : 1,
    transition: isDragging ? 'none' : 'transform 0.3s ease-out, opacity 0.3s ease-out'
  };

  const getSwipeIndicator = () => {
    if (Math.abs(dragOffset.x) < 50) return null;
    
    if (dragOffset.x > 0) {
      return (
        <div className="absolute top-4 left-4 bg-green-500 text-white px-3 py-1 rounded-lg font-semibold transform rotate-12">
          НРАВИТСЯ
        </div>
      );
    } else {
      return (
        <div className="absolute top-4 right-4 bg-red-500 text-white px-3 py-1 rounded-lg font-semibold transform -rotate-12">
          НЕ НРАВИТСЯ
        </div>
      );
    }
  };

  return (
    <div className="relative max-w-4xl mx-auto">
      {/* Счетчик */}
      <div className="text-center mb-4">
        <span className="text-sm text-gray-600">
          {currentIndex + 1} из {unratedSurveys.length}
        </span>
      </div>

      {/* Стопка карточек */}
      <div className="relative h-[600px]">
        {/* Фоновые карточки для эффекта стопки */}
        {[1, 2].map((offset) => {
          const nextIndex = currentIndex + offset;
          if (nextIndex >= unratedSurveys.length) return null;
          
          return (
            <div
              key={`bg-${nextIndex}`}
              className="absolute inset-0 bg-white rounded-xl shadow-lg border"
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
          ref={cardRef}
          className="absolute inset-0 bg-white rounded-xl shadow-xl border cursor-grab active:cursor-grabbing overflow-hidden"
          style={{ ...cardStyle, zIndex: 20 }}
          onMouseDown={handleMouseDown}
        >
          {getSwipeIndicator()}
          
          <div className="h-full overflow-y-auto">
            <div className="p-6">
              <SurveyDisplay survey={currentSurvey} />
            </div>
          </div>
        </div>
      </div>

      {/* Кнопки управления */}
      <div className="flex justify-center items-center gap-4 mt-6">
        <button
          onClick={handleDislike}
          className="flex items-center justify-center w-12 h-12 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors shadow-lg"
          title="Не нравится"
        >
          <HeartOff className="h-6 w-6" />
        </button>
        
        <button
          onClick={handleSkip}
          className="flex items-center justify-center w-10 h-10 bg-gray-400 text-white rounded-full hover:bg-gray-500 transition-colors shadow-lg"
          title="Пропустить"
        >
          <X className="h-5 w-5" />
        </button>
        
        <button
          onClick={handleLike}
          className="flex items-center justify-center w-12 h-12 bg-green-500 text-white rounded-full hover:bg-green-600 transition-colors shadow-lg"
          title="Нравится"
        >
          <Heart className="h-6 w-6" />
        </button>
      </div>

      {/* Подсказки */}
      <div className="text-center mt-4 text-sm text-gray-500">
        <p>Перетащите карточку влево/вправо или используйте кнопки для оценки</p>
        <p>← Не нравится | Пропустить | Нравится →</p>
      </div>
    </div>
  );
};

export default SurveyCardStack;
