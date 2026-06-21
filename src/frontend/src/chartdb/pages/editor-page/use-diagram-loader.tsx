import { useChartDB } from '@chartdb/hooks/use-chartdb';
import { useConfig } from '@chartdb/hooks/use-config';
import { useDialog } from '@chartdb/hooks/use-dialog';
import { useFullScreenLoader } from '@chartdb/hooks/use-full-screen-spinner';
import { useRedoUndoStack } from '@chartdb/hooks/use-redo-undo-stack';
import { useStorage } from '@chartdb/hooks/use-storage';
import type { Diagram } from '@chartdb/lib/domain/diagram';
import { useEffect, useRef, useState } from 'react';

export const useDiagramLoader = () => {
    const [initialDiagram, setInitialDiagram] = useState<Diagram | undefined>();
    const { config } = useConfig();
    const { loadDiagram, currentDiagram } = useChartDB();
    const { resetRedoStack, resetUndoStack } = useRedoUndoStack();
    const { showLoader, hideLoader } = useFullScreenLoader();
    const { openCreateDiagramDialog, openOpenDiagramDialog } = useDialog();
    const { listDiagrams } = useStorage();

    const currentDiagramLoadingRef = useRef<string | undefined>(undefined);

    useEffect(() => {
        if (!config) {
            return;
        }

        const loadDefaultDiagram = async () => {
            // Try loading default diagram from config
            if (config.defaultDiagramId) {
                showLoader();
                resetRedoStack();
                resetUndoStack();
                const diagram = await loadDiagram(config.defaultDiagramId);
                if (diagram) {
                    setInitialDiagram(diagram);
                    hideLoader();
                    return;
                }
                hideLoader();
            }

            // Fallback: list diagrams and open dialog
            const diagrams = await listDiagrams();
            if (diagrams.length > 0) {
                openOpenDiagramDialog({ canClose: false });
            } else {
                openCreateDiagramDialog();
            }
        };

        if (currentDiagramLoadingRef.current !== undefined) {
            return;
        }
        currentDiagramLoadingRef.current = '';

        loadDefaultDiagram();
    }, [
        config,
        openCreateDiagramDialog,
        listDiagrams,
        loadDiagram,
        resetRedoStack,
        resetUndoStack,
        hideLoader,
        showLoader,
        openOpenDiagramDialog,
    ]);

    return { initialDiagram };
};
