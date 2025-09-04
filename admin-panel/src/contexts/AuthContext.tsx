import React, { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import type { UserProfile, TelegramAuth, AuthResponse } from '../types';

interface AuthContextType {
  isAuthenticated: boolean;
  userProfile: UserProfile | null;
  userRole: number;
  authenticate: (telegramAuth: TelegramAuth) => Promise<boolean>;
  logout: () => void;
  updateUserRole: (newRole: number) => void;
  checkUserRole: (telegramId: number) => Promise<void>;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [userRole, setUserRole] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkUserRole = async (telegramId: number) => {
      try {
        const response = await fetch('http://localhost.local:3000/user_roles');
        if (response.ok) {
          const responsibleIds: number[] = await response.json();
          const actualRole = responsibleIds.includes(telegramId) ? 1 : 0;
          
          // Получаем текущую роль из localStorage для сравнения
          const savedAuth = localStorage.getItem('auth');
          let currentRole = 0;
          if (savedAuth) {
            try {
              const authData = JSON.parse(savedAuth);
              currentRole = authData.userRole || 0;
            } catch (error) {
              console.error('Ошибка парсинга localStorage:', error);
            }
          }
          
          // Обновляем роль если она изменилась
          if (actualRole !== currentRole) {
            setUserRole(actualRole);
            
            // Обновляем localStorage
            if (savedAuth) {
              try {
                const authData = JSON.parse(savedAuth);
                authData.userRole = actualRole;
                localStorage.setItem('auth', JSON.stringify(authData));
              } catch (error) {
                console.error('Ошибка обновления localStorage:', error);
              }
            }
          }
        }
      } catch (error) {
        console.error('Ошибка проверки роли пользователя:', error);
      }
    };

    const initializeAuth = async () => {
      // Проверяем сохраненную авторизацию при загрузке
      const savedAuth = localStorage.getItem('auth');
      if (savedAuth) {
        try {
          const authData = JSON.parse(savedAuth);
          setIsAuthenticated(true);
          setUserProfile(authData.userProfile);
          setUserRole(authData.userRole);
          
          // Проверяем актуальную роль пользователя из API
          await checkUserRole(authData.userProfile.telegram_id);
        } catch (error) {
          console.error('Ошибка загрузки сохраненной авторизации:', error);
          localStorage.removeItem('auth');
        }
      }
      
      // Telegram Login Widget инициализируется автоматически через HTML
      
      setLoading(false);
    };

    initializeAuth();
  }, []);

  const checkUserRole = async (telegramId: number) => {
    try {
      const response = await fetch('http://localhost.local:3000/user_roles');
      if (response.ok) {
        const responsibleIds: number[] = await response.json();
        const actualRole = responsibleIds.includes(telegramId) ? 1 : 0;
        
        // Обновляем роль
        setUserRole(actualRole);
        
        // Обновляем localStorage
        const savedAuth = localStorage.getItem('auth');
        if (savedAuth) {
          try {
            const authData = JSON.parse(savedAuth);
            authData.userRole = actualRole;
            localStorage.setItem('auth', JSON.stringify(authData));
          } catch (error) {
            console.error('Ошибка обновления localStorage:', error);
          }
        }
      }
    } catch (error) {
      console.error('Ошибка проверки роли пользователя:', error);
    }
  };

  const authenticate = async (telegramAuth: TelegramAuth): Promise<boolean> => {
    try {
      const response = await fetch('http://localhost.local:3000/auth/telegram', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(telegramAuth),
      });
      
      if (response.ok) {
        const authResult: AuthResponse = await response.json();
        if (authResult.success && authResult.user_profile) {
          setIsAuthenticated(true);
          setUserProfile(authResult.user_profile);
          setUserRole(authResult.user_role || 0);
          
          // Сохраняем авторизацию в localStorage
          localStorage.setItem('auth', JSON.stringify({
            userProfile: authResult.user_profile,
            userRole: authResult.user_role || 0
          }));
          
          return true;
        }
      }
      return false;
    } catch (error) {
      console.error('Ошибка авторизации:', error);
      return false;
    }
  };

  const updateUserRole = (newRole: number) => {
    setUserRole(newRole);
    
    // Обновляем сохраненную авторизацию в localStorage
    const savedAuth = localStorage.getItem('auth');
    if (savedAuth) {
      try {
        const authData = JSON.parse(savedAuth);
        authData.userRole = newRole;
        localStorage.setItem('auth', JSON.stringify(authData));
      } catch (error) {
        console.error('Ошибка обновления роли в localStorage:', error);
      }
    }
  };

  const logout = () => {
    setIsAuthenticated(false);
    setUserProfile(null);
    setUserRole(0);
    localStorage.removeItem('auth');
    
    // Очищаем Telegram виджет из DOM
    const widgetContainer = document.getElementById('telegram-login-widget');
    if (widgetContainer) {
      widgetContainer.innerHTML = '';
    }
    
    // Очищаем глобальную функцию
    (window as any).onTelegramAuth = undefined;
  };

  const value: AuthContextType = {
    isAuthenticated,
    userProfile,
    userRole,
    authenticate,
    logout,
    updateUserRole,
    checkUserRole,
    loading
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
