import { Tabs as TabsPrimitive } from '@base-ui/react/tabs';
import { cn } from '@renderer/utils/utils';

function Tabs({ className, ...props }: TabsPrimitive.Root.Props) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      className={cn('flex flex-col gap-2', className)}
      {...props}
    />
  );
}

function TabsList({ className, ...props }: TabsPrimitive.List.Props) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        'relative inline-flex h-7 w-full items-center gap-0.5 rounded-md border border-border bg-background-1/40 p-0.5',
        className
      )}
      {...props}
    />
  );
}

function TabsTab({ className, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-tab"
      className={cn(
        'z-10 flex h-full flex-1 items-center justify-center gap-1.5 rounded-[5px] px-2 text-xs font-medium text-foreground-passive transition-colors',
        'hover:text-foreground data-[selected]:text-foreground',
        className
      )}
      {...props}
    />
  );
}

function TabsIndicator({ className, ...props }: TabsPrimitive.Indicator.Props) {
  return (
    <TabsPrimitive.Indicator
      data-slot="tabs-indicator"
      className={cn(
        'absolute left-0 top-1/2 z-0 h-[calc(100%-4px)] -translate-y-1/2 rounded-[5px] bg-background shadow-sm transition-all duration-200',
        'w-[var(--active-tab-width)] translate-x-[var(--active-tab-left)]',
        className
      )}
      {...props}
    />
  );
}

function TabsPanel({ className, ...props }: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-panel"
      className={cn('min-h-0 flex-1 outline-none', className)}
      {...props}
    />
  );
}

export { Tabs, TabsList, TabsTab, TabsIndicator, TabsPanel };
