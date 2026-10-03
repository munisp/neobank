import React, { createContext, useState, useEffect } from 'react';

export const AppContext = createContext({
  theme: 'light',
  language: 'en',
  isOnline: true,
  setTheme: () => {},
  setLanguage: () => {},
});

export const AppProvider = ({ children }) => {
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'light');
  const [language, setLanguage] = useState(() => localStorage.getItem('language') || 'en');
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => { localStorage.setItem('theme', theme); }, [theme]);
  useEffect(() => { localStorage.setItem('language', language); }, [language]);

  useEffect(() => {
    const online = () => setIsOnline(true);
    const offline = () => setIsOnline(false);
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    return () => {
      window.removeEventListener('online', online);
      window.removeEventListener('offline', offline);
    };
  }, []);

  return (
    <AppContext.Provider value={{ theme, language, isOnline, setTheme, setLanguage }}>
      {children}
    </AppContext.Provider>
  );
};

export default AppContext;
