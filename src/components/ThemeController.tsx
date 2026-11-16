import { useEffect } from 'react';
import { useAppSelector } from '../store/hooks';

export default function ThemeController() {
  const theme = useAppSelector((state) => state.ui.theme);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme === 'paper' || theme === 'mono' ? 'light' : 'dark';
  }, [theme]);
  return null;
}
