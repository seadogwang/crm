import React from 'react';
import { cn } from '@chartdb/lib/utils';

const ResizablePanelGroup = ({
    className,
    children,
    ...props
}: React.HTMLAttributes<HTMLDivElement> & { direction?: 'horizontal' | 'vertical' }) => (
    <div className={cn('flex h-full w-full', className)} {...props}>
        {children}
    </div>
);

const ResizablePanel = ({
    className,
    children,
    ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
    <div className={cn('flex-1 overflow-hidden', className)} {...props}>
        {children}
    </div>
);

const ResizableHandle = ({
    className,
    ...props
}: React.HTMLAttributes<HTMLDivElement> & { withHandle?: boolean }) => (
    <div className={cn('w-px bg-border', className)} {...props} />
);

export { ResizablePanelGroup, ResizablePanel, ResizableHandle };