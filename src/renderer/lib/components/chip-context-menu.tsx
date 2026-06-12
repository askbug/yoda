import { Fragment } from 'react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@renderer/lib/ui/context-menu';

/**
 * Right-click menu around a side-pane strip chip (task sidebar, shell side
 * pane); sections render separated like AppTabContextMenu.
 */
export function ChipContextMenu({
  sections,
  children,
}: {
  sections: React.ReactNode[][];
  children: React.ReactNode;
}) {
  const filtered = sections.filter((section) => section.length > 0);
  if (filtered.length === 0) return <>{children}</>;

  return (
    <ContextMenu>
      <ContextMenuTrigger>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-56">
        {filtered.map((section, index) => (
          // Sections are stable per chip kind — index keys are fine here.
          <Fragment key={index}>
            {index > 0 ? <ContextMenuSeparator /> : null}
            {section}
          </Fragment>
        ))}
      </ContextMenuContent>
    </ContextMenu>
  );
}
