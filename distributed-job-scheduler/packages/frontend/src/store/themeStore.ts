import { create } from 'zustand';

interface ThemeState {
  theme: 'dark' | 'light';
  toggleTheme: () => void;
}

const getInitialTheme = (): 'dark' | 'light' => {
  const saved = localStorage.getItem('theme');
  if (saved === 'light' || saved === 'dark') return saved;
  return 'dark'; // default to dark
};

const initialTheme = getInitialTheme();
document.documentElement.setAttribute('data-theme', initialTheme);

export const useThemeStore = create<ThemeState>((set) => ({
  theme: initialTheme,
  toggleTheme: () => set((state) => {
    const newTheme = state.theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('theme', newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
    return { theme: newTheme };
  })
}));
