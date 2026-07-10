import React, { useState, useEffect } from 'react';
import './ThemeToggle.css';

export default function ThemeToggle() {
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('theme-preference') || 'system';
  });

  useEffect(() => {
    const root = document.documentElement;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const applyTheme = (currentTheme) => {
      root.classList.remove('light', 'dark');
      if (currentTheme === 'system') {
        const systemTheme = mediaQuery.matches ? 'dark' : 'light';
        root.classList.add(systemTheme);
        root.setAttribute('data-theme-pref', 'system');
      } else {
        root.classList.add(currentTheme);
        root.setAttribute('data-theme-pref', currentTheme);
      }
    };

    applyTheme(theme);
    localStorage.setItem('theme-preference', theme);

    const handleSystemThemeChange = () => {
      if (theme === 'system') {
        applyTheme('system');
      }
    };

    mediaQuery.addEventListener('change', handleSystemThemeChange);
    return () => {
      mediaQuery.removeEventListener('change', handleSystemThemeChange);
    };
  }, [theme]);

  const themes = [
    {
      id: 'light',
      label: 'Light Mode',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="4"></circle>
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"></path>
        </svg>
      )
    },
    {
      id: 'dark',
      label: 'Dark Mode',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"></path>
        </svg>
      )
    },
    {
      id: 'system',
      label: 'System Mode',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
          <line x1="8" y1="21" x2="16" y2="21"></line>
          <line x1="12" y1="17" x2="12" y2="21"></line>
        </svg>
      )
    }
  ];

  const activeIndex = themes.findIndex((t) => t.id === theme);

  return (
    <div className="theme-toggle-pill" aria-label="Theme Selection">
      <div 
        className="theme-active-indicator" 
        style={{ transform: `translateX(${activeIndex * 100}%)` }}
      />
      {themes.map((t) => (
        <button
          key={t.id}
          onClick={() => setTheme(t.id)}
          className={`theme-toggle-btn ${theme === t.id ? 'is-active' : ''}`}
          aria-label={t.label}
          type="button"
        >
          {t.icon}
        </button>
      ))}
    </div>
  );
}
