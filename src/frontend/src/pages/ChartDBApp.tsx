import React from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { HelmetProvider } from 'react-helmet-async';
import { TooltipProvider } from '@/components/tooltip/tooltip';
import { Toaster } from '@/components/toast/toaster';
import { FullScreenLoaderProvider } from '@/context/full-screen-spinner-context/full-screen-spinner-provider';
import { LayoutProvider } from '@/context/layout-context/layout-provider';
import { LocalConfigProvider } from '@/context/local-config-context/local-config-provider';
import { StorageProvider } from '@/context/storage-context/storage-provider';
import { ConfigProvider } from '@/context/config-context/config-provider';
import { RedoUndoStackProvider } from '@/context/history-context/redo-undo-stack-provider';
import { ChartDBProvider } from '@/context/chartdb-context/chartdb-provider';
import { HistoryProvider } from '@/context/history-context/history-provider';
import { ThemeProvider } from '@/context/theme-context/theme-provider';
import { ExportImageProvider } from '@/context/export-image-context/export-image-provider';
import { DialogProvider } from '@/context/dialog-context/dialog-provider';
import { KeyboardShortcutsProvider } from '@/context/keyboard-shortcuts-context/keyboard-shortcuts-provider';
import { AlertProvider } from '@/context/alert-context/alert-provider';
import { CanvasProvider } from '@/context/canvas-context/canvas-provider';
import { DiffProvider } from '@/context/diff-context/diff-provider';
import { DiagramFilterProvider } from '@/context/diagram-filter-context/diagram-filter-provider';
import EditorDesktopLayout from '../pages/chartdb-editor/editor-desktop-layout';

const ChartDBApp: React.FC = () => (
  <HelmetProvider>
    <TooltipProvider>
      <FullScreenLoaderProvider>
        <LayoutProvider>
          <LocalConfigProvider>
            <ThemeProvider defaultTheme="light" storageKey="chartdb-theme">
              <StorageProvider>
                <ConfigProvider>
                  <RedoUndoStackProvider>
                    <DiffProvider>
                      <ChartDBProvider>
                        <DiagramFilterProvider>
                          <HistoryProvider>
                            <ReactFlowProvider>
                              <CanvasProvider>
                                <ExportImageProvider>
                                  <AlertProvider>
                                    <DialogProvider>
                                      <KeyboardShortcutsProvider>
                                        <EditorDesktopLayout />
                                        <Toaster />
                                      </KeyboardShortcutsProvider>
                                    </DialogProvider>
                                  </AlertProvider>
                                </ExportImageProvider>
                              </CanvasProvider>
                            </ReactFlowProvider>
                          </HistoryProvider>
                        </DiagramFilterProvider>
                      </ChartDBProvider>
                    </DiffProvider>
                  </RedoUndoStackProvider>
                </ConfigProvider>
              </StorageProvider>
            </ThemeProvider>
          </LocalConfigProvider>
        </LayoutProvider>
      </FullScreenLoaderProvider>
    </TooltipProvider>
  </HelmetProvider>
);

export default ChartDBApp;