import { chartDBContext } from '@chartdb/context/chartdb-context/chartdb-context';
import { useContext } from 'react';

export const useChartDB = () => useContext(chartDBContext);
