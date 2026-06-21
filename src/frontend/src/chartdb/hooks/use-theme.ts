import { ThemeContext } from '@chartdb/context/theme-context/theme-context';
import { useContext } from 'react';

export const useTheme = () => useContext(ThemeContext);
