import React, { useState, useEffect } from 'react';
import { X, AlertCircle } from 'lucide-react';
import { externalUsersApi } from '../api';
import type { UserSurvey } from '../types';
import SurveyDisplay from './SurveyDisplay';

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

              {/* Анкета */}
              <SurveyDisplay survey={survey} />
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

