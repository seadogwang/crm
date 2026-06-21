import React, { useCallback } from 'react';
import {
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from '@chartdb/components/accordion/accordion';
import { TableListItemHeader } from './table-list-item-header/table-list-item-header';
import { TableListItemContent } from './table-list-item-content/table-list-item-content';
import type { DBTable } from '@chartdb/lib/domain/db-table';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { CircleDotDashed } from 'lucide-react';
import { useFocusOn } from '@chartdb/hooks/use-focus-on';

export interface TableListItemProps {
    table: DBTable;
}

export const TableListItem = React.forwardRef<
    React.ElementRef<typeof AccordionItem>,
    TableListItemProps
>(({ table }, ref) => {
    const { attributes, setNodeRef, transform, transition } = useSortable({
        id: table.id,
    });
    const style = {
        transform: CSS.Translate.toString(transform),
        transition,
    };
    const { focusOnTable } = useFocusOn();

    const handleFocusOnTable = useCallback(
        (event: React.MouseEvent) => {
            event.stopPropagation();
            focusOnTable(table.id);
        },
        [focusOnTable, table.id]
    );

    return (
        <AccordionItem value={table.id} className="border-none" ref={ref}>
            <div
                className="w-full rounded-md border-b"
                ref={setNodeRef}
                style={style}
                {...attributes}
            >
                <AccordionTrigger
                    className="w-full rounded-md border-l-[6px] px-2 py-0 hover:bg-accent hover:no-underline data-[state=open]:rounded-b-none [&>svg]:hidden"
                    style={{
                        borderColor: table.color,
                    }}
                    asChild
                >
                    <div className="flex items-center w-full">
                        <TableListItemHeader table={table} />
                        <button
                            onClick={handleFocusOnTable}
                            className="p-1 text-slate-400 hover:text-slate-600 flex-shrink-0"
                        >
                            <CircleDotDashed className="size-4" />
                        </button>
                    </div>
                </AccordionTrigger>
                <AccordionContent className="pb-0 pt-0">
                    <TableListItemContent table={table} />
                </AccordionContent>
            </div>
        </AccordionItem>
    );
});

TableListItem.displayName = 'TableListItem';
