import React, { useCallback, useEffect, useMemo } from 'react';
import {
    CircleDotDashed,
    GripVertical,
    Pencil,
    EllipsisVertical,
    Trash2,
    FileType2,
    FileKey2,
    Check,
    Group,
    Copy,
} from 'lucide-react';
import { ListItemHeaderButton } from '@chartdb/pages/editor-page/side-panel/list-item-header-button/list-item-header-button';
import type { DBTable } from '@chartdb/lib/domain/db-table';
import { Input } from '@chartdb/components/input/input';
import { useChartDB } from '@chartdb/hooks/use-chartdb';
import { useClickAway, useKeyPressEvent } from 'react-use';
import { useSortable } from '@dnd-kit/sortable';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@chartdb/components/dropdown-menu/dropdown-menu';
import { useFocusOn } from '@chartdb/hooks/use-focus-on';
import { useTranslation } from 'react-i18next';
import { useDialog } from '@chartdb/hooks/use-dialog';
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from '@chartdb/components/tooltip/tooltip';
import { cloneTable } from '@chartdb/lib/clone';
import type { DBSchema } from '@chartdb/lib/domain';
import { defaultSchemas } from '@chartdb/lib/data/default-schemas';
import { useDiagramFilter } from '@chartdb/context/diagram-filter-context/use-diagram-filter';

export interface TableListItemHeaderProps {
    table: DBTable;
}

export const TableListItemHeader: React.FC<TableListItemHeaderProps> = ({
    table,
}) => {
    const {
        updateTable,
        updateTablesState,
        removeTable,
        createIndex,
        createField,
        createTable,
        schemas,
        databaseType,
        readonly,
    } = useChartDB();
    const { schemasDisplayed } = useDiagramFilter();
    const { openTableSchemaDialog } = useDialog();
    const { t } = useTranslation();
    const { focusOnTable } = useFocusOn();
    const [editMode, setEditMode] = React.useState(false);
    const [tableName, setTableName] = React.useState(table.name);
    const inputRef = React.useRef<HTMLInputElement>(null);
    const { listeners } = useSortable({ id: table.id });

    const editTableName = useCallback(() => {
        if (!editMode) return;
        if (tableName.trim()) {
            updateTable(table.id, { name: tableName.trim() });
        }

        setEditMode(false);
    }, [tableName, table.id, updateTable, editMode]);

    const abortEdit = useCallback(() => {
        setEditMode(false);
        setTableName(table.name);
    }, [table.name]);

    useClickAway(inputRef, editTableName);
    useKeyPressEvent('Enter', editTableName);
    useKeyPressEvent('Escape', abortEdit);

    const enterEditMode = (e: React.MouseEvent) => {
        e.stopPropagation();
        setEditMode(true);
    };

    const handleFocusOnTable = useCallback(
        (event: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
            event.stopPropagation();
            focusOnTable(table.id);
        },
        [focusOnTable, table.id]
    );

    const deleteTableHandler = useCallback(() => {
        removeTable(table.id);
    }, [table.id, removeTable]);

    const updateTableSchema = useCallback(
        ({ schema }: { schema: DBSchema }) => {
            updateTablesState((currentTables) =>
                currentTables.map((t) =>
                    t.id === table.id || !t.schema
                        ? { ...t, schema: schema.name }
                        : t
                )
            );
        },
        [table.id, updateTablesState]
    );

    const changeSchema = useCallback(() => {
        openTableSchemaDialog({
            table,
            schemas,
            onConfirm: updateTableSchema,
            allowSchemaCreation: true,
        });
    }, [openTableSchemaDialog, table, schemas, updateTableSchema]);

    const duplicateTableHandler = useCallback(
        (e: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
            e.stopPropagation();
            const clonedTable = cloneTable(table);

            clonedTable.name = `${clonedTable.name}_copy`;
            clonedTable.x += 30;
            clonedTable.y += 50;

            createTable(clonedTable);
        },
        [createTable, table]
    );

    const renderDropDownMenu = useCallback(
        () => (
            <DropdownMenu>
                <DropdownMenuTrigger>
                    <ListItemHeaderButton>
                        <EllipsisVertical />
                    </ListItemHeaderButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-fit min-w-40">
                    <DropdownMenuLabel>
                        {t(
                            'side_panel.tables_section.table.table_actions.title'
                        )}
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {schemas.length > 0 || defaultSchemas?.[databaseType] ? (
                        <>
                            <DropdownMenuGroup>
                                <DropdownMenuItem
                                    className="flex justify-between gap-4"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        changeSchema();
                                    }}
                                >
                                    {t(
                                        'side_panel.tables_section.table.table_actions.change_schema'
                                    )}
                                    <Group className="size-3.5" />
                                </DropdownMenuItem>
                            </DropdownMenuGroup>
                            <DropdownMenuSeparator />
                        </>
                    ) : null}
                    <DropdownMenuGroup>
                        <DropdownMenuItem
                            className="flex justify-between gap-4"
                            onClick={(e) => {
                                e.stopPropagation();
                                createField(table.id);
                            }}
                        >
                            {t(
                                'side_panel.tables_section.table.table_actions.add_field'
                            )}
                            <FileType2 className="size-3.5" />
                        </DropdownMenuItem>
                        {!table.isView ? (
                            <DropdownMenuItem
                                className="flex justify-between gap-4"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    createIndex(table.id);
                                }}
                            >
                                {t(
                                    'side_panel.tables_section.table.table_actions.add_index'
                                )}
                                <FileKey2 className="size-3.5" />
                            </DropdownMenuItem>
                        ) : null}
                    </DropdownMenuGroup>
                    <DropdownMenuSeparator />
                    <DropdownMenuGroup>
                        <DropdownMenuItem
                            onClick={duplicateTableHandler}
                            className="flex justify-between"
                        >
                            {t(
                                'side_panel.tables_section.table.table_actions.duplicate_table'
                            )}
                            <Copy className="size-3.5" />
                        </DropdownMenuItem>
                    </DropdownMenuGroup>
                    <DropdownMenuSeparator />
                    <DropdownMenuGroup>
                        <DropdownMenuItem
                            onClick={deleteTableHandler}
                            className="flex justify-between !text-red-700"
                        >
                            {t(
                                'side_panel.tables_section.table.table_actions.delete_table'
                            )}
                            <Trash2 className="size-3.5 text-red-700" />
                        </DropdownMenuItem>
                    </DropdownMenuGroup>
                </DropdownMenuContent>
            </DropdownMenu>
        ),
        [
            table.id,
            table.isView,
            createField,
            createIndex,
            deleteTableHandler,
            duplicateTableHandler,
            t,
            changeSchema,
            schemas.length,
            databaseType,
        ]
    );

    const schemaToDisplay = useMemo(() => {
        if (schemasDisplayed.length > 1) {
            return table.schema ?? defaultSchemas[databaseType];
        }
    }, [table.schema, schemasDisplayed.length, databaseType]);

    useEffect(() => {
        if (table.name.trim()) {
            setTableName(table.name.trim());
        }
    }, [table.name]);

    return (
        <div
            className="flex h-8 flex-1 items-center px-2 gap-1"
            onDoubleClick={() => setEditMode(true)}
        >
            {editMode ? (
                <>
                    <input
                        ref={inputRef}
                        autoFocus
                        type="text"
                        value={tableName}
                        onChange={(e) => setTableName(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') editTableName();
                            if (e.key === 'Escape') abortEdit();
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="h-7 w-24 border border-gray-300 rounded px-1 text-sm focus:outline-none focus:border-blue-400"
                    />
                    <button
                        onClick={(e) => { e.stopPropagation(); editTableName(); }}
                        className="p-1 text-green-600 hover:text-green-700"
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 6 9 17l-5-5"/></svg>
                    </button>
                </>
            ) : (
                <span className="truncate text-sm">{table.name}</span>
            )}
        </div>
    );
};
