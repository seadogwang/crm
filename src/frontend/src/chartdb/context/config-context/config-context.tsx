import { createContext } from 'react';
import { emptyFn } from '@chartdb/lib/utils';
import type { ChartDBConfig } from '@chartdb/lib/domain/config';

export interface ConfigContext {
    config?: ChartDBConfig;
    updateConfig: (params: {
        config?: Partial<ChartDBConfig>;
        updateFn?: (config: ChartDBConfig) => ChartDBConfig;
    }) => Promise<void>;
}

export const ConfigContext = createContext<ConfigContext>({
    config: undefined,
    updateConfig: emptyFn,
});
