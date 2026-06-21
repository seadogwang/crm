import React from 'react';
import { SidePanel } from './side-panel/side-panel';
import { Canvas } from './canvas/canvas';
import { useLayout } from '@chartdb/hooks/use-layout';
import type { Diagram } from '@chartdb/lib/domain/diagram';
import { cn } from '@chartdb/lib/utils';
import { SidebarProvider } from '@chartdb/components/sidebar/sidebar';
import { EditorSidebar } from './editor-sidebar/editor-sidebar';

export interface EditorDesktopLayoutProps {
    initialDiagram?: Diagram;
}
export const EditorDesktopLayout: React.FC<EditorDesktopLayoutProps> = ({
    initialDiagram,
}) => {
    const { isSidePanelShowed, selectedSidebarSection } = useLayout();
    const isAPIMode = selectedSidebarSection === 'visuals';

    return (
        <SidebarProvider
            defaultOpen={false}
            open={false}
            className="flex-1 min-h-0"
        >
            <EditorSidebar />
            <div className="flex flex-1 min-w-0">
                <div className={isSidePanelShowed ? 'w-[150px] min-w-[150px]' : 'hidden'}>
                    <SidePanel />
                </div>
                <div className="flex-1 min-w-0">
                    <Canvas initialTables={initialDiagram?.tables ?? []} />
                </div>
            </div>
        </SidebarProvider>
    );
};

export default EditorDesktopLayout;
