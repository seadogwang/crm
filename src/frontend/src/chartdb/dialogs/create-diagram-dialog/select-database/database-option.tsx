import React, { useMemo } from 'react';
import { ToggleGroupItem } from '@chartdb/components/toggle/toggle-group';
import type { DatabaseType } from '@chartdb/lib/domain/database-type';
import { databaseTypeToLabelMap, getDatabaseLogo } from '@chartdb/lib/databases';
import { useTheme } from '@chartdb/hooks/use-theme';

export interface DatabaseOptionProps {
    type: DatabaseType;
}

export const DatabaseOption: React.FC<DatabaseOptionProps> = ({ type }) => {
    const { effectiveTheme } = useTheme();
    const logo = useMemo(
        () => getDatabaseLogo(type, effectiveTheme),
        [type, effectiveTheme]
    );

    return (
        <ToggleGroupItem
            value={type}
            aria-label="Toggle bold"
            className="flex size-20 md:size-32"
        >
            <img src={logo} alt={databaseTypeToLabelMap[type]} />
        </ToggleGroupItem>
    );
};
