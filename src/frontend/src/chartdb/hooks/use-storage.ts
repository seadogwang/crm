import { useContext } from 'react';
import { storageContext } from '@chartdb/context/storage-context/storage-context';

export const useStorage = () => useContext(storageContext);
