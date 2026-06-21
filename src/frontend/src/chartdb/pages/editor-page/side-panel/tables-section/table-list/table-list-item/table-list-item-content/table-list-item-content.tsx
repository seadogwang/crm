import React, { useCallback } from 'react';
import {
    Plus,
    FileType2,
    FileKey2,
    MessageCircleMore,
    ListChecks,
} from 'lucide-react';
import { Button } from '@chartdb/components/button/button';
import {
    Accordion,
    AccordionItem,
    AccordionTrigger,
    AccordionContent,
} from '@chartdb/components/accordion/accordion';
import { Separator } from '@chartdb/components/separator/separator';
import type { DBTable } from '@chartdb/lib/domain/db-table';
import type { DBField } from '@chartdb/lib/domain/db-field';
import type { DBCheckConstraint } from '@chartdb/lib/domain/db-check-constraint';
import { useChartDB } from '@chartdb/hooks/use-chartdb';
import { TableField } from './table-field/table-field';
import { TableIndex } from './table-index/table-index';
import { TableCheckConstraint } from './table-check-constraint/table-check-constraint';
import type { DBIndex } from '@chartdb/lib/domain/db-index';
import { useTranslation } from 'react-i18next';
import { Textarea } from '@chartdb/components/textarea/textarea';
import type { DragEndEvent } from '@dnd-kit/core';
import {
    DndContext,
    closestCenter,
    PointerSensor,
    useSensor,
    useSensors,
} from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { ColorPicker } from '@chartdb/components/color-picker/color-picker';

type AccordionItemValue = 'fields' | 'indexes' | 'checks';

export interface TableListItemContentProps {
    table: DBTable;
}

export const TableListItemContent: React.FC<TableListItemContentProps> = ({
    table,
}) => {
    const {
        updateField,
        removeField,
        createField,
        createIndex,
        removeIndex,
        updateIndex,
        createCheckConstraint,
        removeCheckConstraint,
        updateCheckConstraint,
        updateTable,
        readonly,
        databaseType,
    } = useChartDB();
    const { t } = useTranslation();
    const { color } = table;
    const [selectedItems, setSelectedItems] = React.useState<
        AccordionItemValue[]
    >(['fields']);
    const sensors = useSensors(useSensor(PointerSensor));

    // Create a memoized version of the field updater that handles primary key logic
    const handleFieldUpdate = useCallback(
        (fieldId: string, attrs: Partial<DBField>) => {
            updateField(table.id, fieldId, attrs);

            // Handle the case when removing a primary key and only one remains
            if (attrs.primaryKey === false) {
                const remainingPrimaryKeys = table.fields.filter(
                    (f) => f.id !== fieldId && f.primaryKey
                );
                if (remainingPrimaryKeys.length === 1) {
                    // Set the remaining primary key field as unique
                    updateField(
                        table.id,
                        remainingPrimaryKeys[0].id,
                        {
                            unique: true,
                        },
                        { updateHistory: false }
                    );
                }
            }
        },
        [table.id, table.fields, updateField]
    );

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;

        if (active?.id !== over?.id && !!over && !!active) {
            const items = table.fields;
            const oldIndex = items.findIndex((item) => item.id === active.id);
            const newIndex = items.findIndex((item) => item.id === over.id);

            updateTable(table.id, {
                fields: arrayMove(items, oldIndex, newIndex),
            });
        }
    };

    const createIndexHandler = useCallback(
        (e: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
            e.stopPropagation();
            setSelectedItems((prev) => {
                if (prev.includes('indexes')) {
                    return prev;
                }

                return [...prev, 'indexes'];
            });

            createIndex(table.id);
        },
        [createIndex, table.id, setSelectedItems]
    );

    const createFieldHandler = useCallback(
        (e: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
            e.stopPropagation();
            createField(table.id);
        },
        [createField, table.id]
    );

    const createCheckConstraintHandler = useCallback(
        (e: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
            e.stopPropagation();
            setSelectedItems((prev) =>
                prev.includes('checks') ? prev : [...prev, 'checks']
            );
            createCheckConstraint(table.id);
        },
        [createCheckConstraint, table.id, setSelectedItems]
    );

    return null;
};
