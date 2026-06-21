import { dialogContext } from '@chartdb/context/dialog-context/dialog-context';
import { useContext } from 'react';

export const useDialog = () => useContext(dialogContext);
