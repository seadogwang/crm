import React, { useMemo } from 'react';
import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarGroup,
    SidebarGroupContent,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
} from '@chartdb/components/sidebar/sidebar';
import {
    BookOpen,
    Group,
    FileType,
    Plus,
    FolderOpen,
    CodeXml,
} from 'lucide-react';
import { Table, Workflow } from 'lucide-react';
import { useLayout } from '@chartdb/hooks/use-layout';
import { useTranslation } from 'react-i18next';
import { useBreakpoint } from '@chartdb/hooks/use-breakpoint';
import ChartDBLogo from '@chartdb/assets/logo-light.png';
import ChartDBDarkLogo from '@chartdb/assets/logo-dark.png';
import { useTheme } from '@chartdb/hooks/use-theme';
import { useChartDB } from '@chartdb/hooks/use-chartdb';
import { supportsCustomTypes } from '@chartdb/lib/domain/database-capabilities';
import { useDialog } from '@chartdb/hooks/use-dialog';
import { Separator } from '@chartdb/components/separator/separator';

export interface SidebarItem {
    title: string;
    icon: React.FC;
    onClick: () => void;
    active: boolean;
    badge?: string;
}

export interface EditorSidebarProps {}

export const EditorSidebar: React.FC<EditorSidebarProps> = () => {
    const {
        selectSidebarSection,
        selectedSidebarSection,
        showSidePanel,
        selectVisualsTab,
    } = useLayout();
    const { t } = useTranslation();
    const { isMd: isDesktop } = useBreakpoint('md');
    const { effectiveTheme } = useTheme();
    const { databaseType } = useChartDB();
    const { openCreateDiagramDialog, openOpenDiagramDialog } = useDialog();

    const diagramItems: SidebarItem[] = [];

    const baseItems: SidebarItem[] = useMemo(
        () => [
            {
                title: '实体',
                icon: Table,
                onClick: () => {
                    showSidePanel();
                    selectSidebarSection('tables');
                },
                active: selectedSidebarSection === 'tables',
            },
            {
                title: 'API',
                icon: Group,
                onClick: () => {
                    showSidePanel();
                    selectSidebarSection('visuals');
                    selectVisualsTab('areas');
                },
                active: selectedSidebarSection === 'visuals',
            },
            ...(supportsCustomTypes(databaseType)
                ? [
                      {
                          title: '自定义类型',
                          icon: FileType,
                          onClick: () => {
                              showSidePanel();
                              selectSidebarSection('customTypes');
                          },
                          active: selectedSidebarSection === 'customTypes',
                      },
                  ]
                : []),
            {
                title: '关系',
                icon: Workflow,
                onClick: () => {
                    showSidePanel();
                    selectSidebarSection('refs');
                },
                active: selectedSidebarSection === 'refs',
            },
        ],
        [
            selectSidebarSection,
            selectedSidebarSection,
            t,
            showSidePanel,
            databaseType,
            selectVisualsTab,
        ]
    );

    
    return (
        <Sidebar
            side="left"
            collapsible="icon-extended"
            variant="sidebar"
            className="relative h-full"
        >
            {!isDesktop ? (
                <SidebarHeader>
                    <a
                        href="https://chartdb.io"
                        className="cursor-pointer"
                        rel="noreferrer"
                    >
                        <img
                            src={
                                effectiveTheme === 'light'
                                    ? ChartDBLogo
                                    : ChartDBDarkLogo
                            }
                            alt="chartDB"
                            className="h-4 max-w-fit"
                        />
                    </a>
                </SidebarHeader>
            ) : null}
            <SidebarContent>
                <SidebarGroup>
                    {/* <SidebarGroupLabel /> */}
                    <SidebarGroupContent>
                        <SidebarMenu>
                            {baseItems.map((item) => (
                                <SidebarMenuItem key={item.title}>
                                    <SidebarMenuButton
                                        className="justify-center space-y-0.5 !px-0 hover:bg-gray-200 data-[active=true]:bg-gray-100 data-[active=true]:text-pink-600 data-[active=true]:hover:bg-pink-100 dark:hover:bg-gray-800 dark:data-[active=true]:bg-gray-900 dark:data-[active=true]:text-pink-400 dark:data-[active=true]:hover:bg-pink-950"
                                        isActive={item.active}
                                        asChild
                                    >
                                        <button onClick={item.onClick}>
                                            <item.icon />
                                            <span>
                                                {item.title
                                                    .split(' ')
                                                    .map((word, index) => (
                                                        <div key={index}>
                                                            {word}
                                                        </div>
                                                    ))}
                                            </span>
                                        </button>
                                    </SidebarMenuButton>
                                </SidebarMenuItem>
                            ))}
                        </SidebarMenu>
                    </SidebarGroupContent>
                </SidebarGroup>
            </SidebarContent>

                    </Sidebar>
    );
};
