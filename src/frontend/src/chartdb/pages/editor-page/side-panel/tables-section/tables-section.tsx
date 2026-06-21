import React, { useCallback, useMemo } from 'react';
import { TableList } from './table-list/table-list';
import { Button } from '@chartdb/components/button/button';
import { Table, View, X, EyeOff } from 'lucide-react';
import type { DBTable } from '@chartdb/lib/domain/db-table';
import { useChartDB } from '@chartdb/hooks/use-chartdb';
import { useLayout } from '@chartdb/hooks/use-layout';
import { EmptyState } from '@chartdb/components/empty-state/empty-state';
import { ScrollArea } from '@chartdb/components/scroll-area/scroll-area';
import { useTranslation } from 'react-i18next';
import { useViewport } from '@xyflow/react';
import { useDialog } from '@chartdb/hooks/use-dialog';
import type { DBSchema } from '@chartdb/lib/domain';
import { useDiagramFilter } from '@chartdb/context/diagram-filter-context/use-diagram-filter';
import { filterTable } from '@chartdb/lib/domain/diagram-filter/filter';
import { defaultSchemas } from '@chartdb/lib/data/default-schemas';
import { ButtonWithAlternatives } from '@chartdb/components/button/button-with-alternatives';
import { useLocalConfig } from '@chartdb/hooks/use-local-config';

export interface TablesSectionProps {}

export const TablesSection: React.FC<TablesSectionProps> = () => {
    const { createTable, tables, databaseType, readonly } = useChartDB();
    const { filter, schemasDisplayed, hasActiveFilter, resetFilter } =
        useDiagramFilter();
    const { openTableSchemaDialog } = useDialog();
    const viewport = useViewport();
    const { t } = useTranslation();
    const { openTableFromSidebar } = useLayout();
    const { showDBViews } = useLocalConfig();

    // Filter tables by the diagram filter (schemas/tables visibility)
    const filteredTables = useMemo(
        () =>
            tables.filter((table) =>
                filterTable({
                    table: { id: table.id, schema: table.schema },
                    filter,
                    options: { defaultSchema: defaultSchemas[databaseType] },
                })
            ),
        [tables, filter, databaseType]
    );

    // Check if all tables are hidden by the diagram filter
    const allTablesHiddenByDiagramFilter = useMemo(() => {
        if (!hasActiveFilter || tables.length === 0) {
            return false;
        }
        return filteredTables.length === 0;
    }, [hasActiveFilter, tables.length, filteredTables.length]);

    const getCenterLocation = useCallback(() => {
        const padding = 80;
        const centerX = -viewport.x / viewport.zoom + padding / viewport.zoom;
        const centerY = -viewport.y / viewport.zoom + padding / viewport.zoom;

        return { centerX, centerY };
    }, [viewport.x, viewport.y, viewport.zoom]);

    const createTableWithLocation = useCallback(
        async ({ schema }: { schema?: DBSchema }) => {
            const { centerX, centerY } = getCenterLocation();
            const table = await createTable({
                x: centerX,
                y: centerY,
                schema: schema?.name,
            });
            openTableFromSidebar(table.id);
        },
        [createTable, openTableFromSidebar, getCenterLocation]
    );

    const createViewWithLocation = useCallback(
        async ({ schema }: { schema?: DBSchema }) => {
            const { centerX, centerY } = getCenterLocation();
            const table = await createTable({
                x: centerX,
                y: centerY,
                schema: schema?.name,
                isView: true,
            });
            openTableFromSidebar(table.id);
        },
        [createTable, openTableFromSidebar, getCenterLocation]
    );

    const handleCreateTable = useCallback(
        async ({ view }: { view?: boolean }) => {
            if (schemasDisplayed.length > 1) {
                openTableSchemaDialog({
                    onConfirm: view
                        ? createViewWithLocation
                        : createTableWithLocation,
                    schemas: schemasDisplayed,
                });
            } else {
                const schema =
                    schemasDisplayed.length === 1
                        ? schemasDisplayed[0]
                        : undefined;

                if (view) {
                    createViewWithLocation({ schema });
                } else {
                    createTableWithLocation({ schema });
                }
            }
        },
        [
            createViewWithLocation,
            createTableWithLocation,
            schemasDisplayed,
            openTableSchemaDialog,
        ]
    );

    return (
        <section
            className="flex flex-1 flex-col overflow-hidden"
            data-vaul-no-drag
        >
            <div className="bg-white border-b border-gray-200">
                {!readonly ? (
                    <ButtonWithAlternatives
                        variant="secondary"
                        className="h-8 p-2 text-xs !w-full rounded-none bg-white hover:bg-gray-100 border-0 !flex"
                        onClick={() => handleCreateTable({ view: false })}
                        dropdownTriggerClassName="px-1"
                        chevronDownIconClassName="!size-3.5"
                        alternatives={
                            showDBViews
                                ? [
                                      {
                                          label: t(
                                              'side_panel.tables_section.add_view'
                                          ),
                                          onClick: () =>
                                              handleCreateTable({ view: true }),
                                          icon: <View className="size-4" />,
                                          className: 'text-xs',
                                      },
                                  ]
                                : []
                        }
                    >
                        <Table className="h-4" />
                        创建业务实体
                    </ButtonWithAlternatives>
                ) : null}
            </div>
            {/* Indicator when all tables are hidden by diagram filter */}
            {allTablesHiddenByDiagramFilter && (
                <div className="mb-2 flex items-center gap-2 rounded-md border bg-muted/50 px-3 py-2">
                    <EyeOff className="size-4 text-muted-foreground" />
                    <span className="flex-1 text-xs text-muted-foreground">
                        {t('side_panel.tables_section.all_hidden')}
                    </span>
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-6 px-2 text-xs"
                        onClick={() => resetFilter()}
                    >
                        {t('side_panel.tables_section.show_all')}
                    </Button>
                </div>
            )}
            <div className="flex flex-1 flex-col overflow-hidden">
                <ScrollArea className="h-full">
                    {tables.length === 0 ? (
                        <EmptyState
                            title="空"
                            description=""
                            className="mt-20"
                            secondaryAction={
                                !readonly
                                    ? {
                                          label: '创建业务实体',
                                          onClick: () =>
                                              handleCreateTable({
                                                  view: false,
                                              }),
                                      }
                                    : undefined
                            }
                        />
                    ) : (
                        <TableList tables={filteredTables} />
                    )}
                </ScrollArea>
            </div>
        </section>
    );
};
