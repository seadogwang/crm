import { Spinner } from '@chartdb/components/spinner/spinner';
import React, { useCallback, useEffect, useRef } from 'react';
import { useLoaderData, useNavigate } from '@chartdb/lib/router-stubs';
import type { TemplatePageLoaderData } from '../template-page/template-page';
import { convertTemplateToNewDiagram } from '@chartdb/templates-data/template-utils';
import type { Diagram } from '@chartdb/lib/domain/diagram';
import { useStorage } from '@chartdb/hooks/use-storage';
import { LocalConfigProvider } from '@chartdb/context/local-config-context/local-config-provider';
import { StorageProvider } from '@chartdb/context/storage-context/storage-provider';
import { ThemeProvider } from '@chartdb/context/theme-context/theme-provider';

export const CloneTemplateComponent: React.FC = () => {
    const navigate = useNavigate();
    const { addDiagram, deleteDiagram } = useStorage();
    const clonedBefore = useRef<boolean>(false);
    const data = useLoaderData() as TemplatePageLoaderData;

    const template = data.template;

    const cloneTemplate = useCallback(async () => {
        if (!template) {
            return;
        }

        if (clonedBefore.current) {
            return;
        }

        clonedBefore.current = true;
        const diagram = convertTemplateToNewDiagram(template);

        await deleteDiagram(diagram.id);

        const now = new Date();
        const diagramToAdd: Diagram = {
            ...diagram,
            createdAt: now,
            updatedAt: now,
        };

        await addDiagram({ diagram: diagramToAdd });
        navigate(`/diagrams/${diagramToAdd.id}`);
    }, [addDiagram, deleteDiagram, navigate, template]);

    useEffect(() => {
        if (!template) {
            navigate('/templates');
        } else {
            cloneTemplate();
        }
    }, [template, navigate, cloneTemplate]);

    return (
        <section className="flex w-screen flex-col bg-background">
            <Spinner size={'large'} className="mt-20 text-pink-600" />
        </section>
    );
};

export const CloneTemplatePage: React.FC = () => (
    <LocalConfigProvider>
        <StorageProvider>
            <ThemeProvider>
                <CloneTemplateComponent />
            </ThemeProvider>
        </StorageProvider>
    </LocalConfigProvider>
);
