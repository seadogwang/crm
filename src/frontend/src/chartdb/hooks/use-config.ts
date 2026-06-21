import { useContext } from 'react';
import { ConfigContext } from '@chartdb/context/config-context/config-context';

export const useConfig = () => useContext(ConfigContext);
