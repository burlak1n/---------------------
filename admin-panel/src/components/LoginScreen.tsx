import React, { useState, useEffect } from 'react';
import { UserCheck } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import type { TelegramAuth } from '../types';

// Глобальная функция для обработки авторизации через Telegram Widget
declare global {
  interface Window {
    onTelegramAuth: (user: any) => void;
  }
}

const LoginScreen: React.FC = () => {
  const { authenticate } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [widgetInitialized, setWidgetInitialized] = useState(false);

  useEffect(() => {
    // Устанавливаем глобальную функцию для обработки авторизации
    window.onTelegramAuth = (user: any) => {
      setError(null);
      
      const telegramAuth: TelegramAuth = {
        id: user.id,
        first_name: user.first_name,
        last_name: user.last_name,
        username: user.username,
        auth_date: user.auth_date,
        hash: user.hash
      };
      
      authenticate(telegramAuth).then(success => {
        if (!success) {
          setError('Ошибка авторизации. Пользователь не найден в системе.');
        }
      });
    };

    // Инициализируем виджет после загрузки компонента
    const initWidget = () => {
      if (widgetInitialized) return;
      
      const widgetContainer = document.getElementById('telegram-login-widget');
      if (widgetContainer && !widgetContainer.hasChildNodes()) {
        const script = document.createElement('script');
        script.async = true;
        script.src = 'https://telegram.org/js/telegram-widget.js?22';
        script.setAttribute('data-telegram-login', 'ingroupsts_org_bot');
        script.setAttribute('data-size', 'large');
        script.setAttribute('data-onauth', 'onTelegramAuth(user)');
        script.setAttribute('data-request-access', 'write');
        
        script.onerror = () => {
          setError('Ошибка загрузки виджета Telegram');
        };
        
        script.onload = () => {
          setWidgetInitialized(true);
        };
        
        widgetContainer.appendChild(script);
      }
    };

    // Инициализируем виджет с небольшой задержкой
    const timer = setTimeout(initWidget, 100);
    
    // Очистка при размонтировании компонента
    return () => {
      clearTimeout(timer);
      // Очищаем контейнер виджета
      const widgetContainer = document.getElementById('telegram-login-widget');
      if (widgetContainer) {
        widgetContainer.innerHTML = '';
      }
      // Удаляем глобальную функцию
      (window as any).onTelegramAuth = undefined;
      // Сбрасываем флаг инициализации
      setWidgetInitialized(false);
    };
  }, [authenticate]);


  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center">
          <UserCheck className="h-12 w-12 text-blue-600" />
        </div>
        <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
          Шандер
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600">
          Для доступа к системе необходимо войти через Telegram
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
          <div className="space-y-6">
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-md p-4">
                <p className="text-red-700 text-sm">{error}</p>
              </div>
            )}
            
            <div className="text-center space-y-4">
              {/* Telegram Login Widget */}
              <div className="flex justify-center">
                <div id="telegram-login-widget" className="min-h-[40px] flex items-center justify-center">
                </div>
              </div>
            </div>
            
            <div className="text-center text-xs text-gray-500">
              <p>Нажмите кнопку выше для авторизации через Telegram</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginScreen;
