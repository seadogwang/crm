import { useContext } from 'react';
import { historyContext } from '@chartdb/context/history-context/history-context';

export const useHistory = () => useContext(historyContext);
