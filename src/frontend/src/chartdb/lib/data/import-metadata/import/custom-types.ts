import type { DBCustomType, DBCustomTypeKind } from '@chartdb/lib/domain';
import { schemaNameToDomainSchemaName } from '@chartdb/lib/domain';
import type { DBCustomTypeInfo } from '../metadata-types/custom-type-info';
import { generateId } from '@chartdb/lib/utils';

export const createCustomTypesFromMetadata = ({
    customTypes,
}: {
    customTypes: DBCustomTypeInfo[];
}): DBCustomType[] => {
    return customTypes.map((customType) => {
        return {
            id: generateId(),
            schema: schemaNameToDomainSchemaName(customType.schema),
            name: customType.type,
            kind: customType.kind as DBCustomTypeKind,
            values: customType.values,
            fields: customType.fields,
        };
    });
};
