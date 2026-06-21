import { useContext } from 'react';
import { layoutContext } from '@chartdb/context/layout-context/layout-context';

export const useLayout = () => useContext(layoutContext);
