import {
  closestCenter,
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import { observer } from 'mobx-react-lite';
import { useTranslation } from 'react-i18next';
import {
  SIDEBAR_NAV_ITEM_LABEL_I18N,
  type SidebarNavItemKey,
} from '@renderer/features/sidebar/nav-items';
import { sidebarStore } from '@renderer/lib/stores/app-state';
import { Switch } from '@renderer/lib/ui/switch';
import { cn } from '@renderer/utils/utils';

/**
 * Lets the user reorder (drag) and show/hide (switch) the secondary sidebar nav
 * items. Changes apply live to the SidebarStore — which persists through its
 * snapshot — so there is no explicit save step.
 */
export const SidebarNavSettingsCard = observer(function SidebarNavSettingsCard() {
  const items = sidebarStore.orderedNavItems;

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = items.indexOf(active.id as SidebarNavItemKey);
    const newIndex = items.indexOf(over.id as SidebarNavItemKey);
    if (oldIndex === -1 || newIndex === -1) return;
    sidebarStore.setNavItemOrder(arrayMove(items, oldIndex, newIndex));
  };

  return (
    <div className="rounded-xl border border-border/60 bg-muted/10 p-2">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={items} strategy={verticalListSortingStrategy}>
          <div className="space-y-1">
            {items.map((key) => (
              <SortableNavRow key={key} itemKey={key} />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
});

const SortableNavRow = observer(function SortableNavRow({
  itemKey,
}: {
  itemKey: SidebarNavItemKey;
}) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: itemKey,
  });
  const label = t(SIDEBAR_NAV_ITEM_LABEL_I18N[itemKey]);
  const visible = !sidebarStore.isNavItemHidden(itemKey);

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'flex items-center gap-2 rounded-lg border border-transparent px-2 py-1.5 transition-colors hover:bg-background-1',
        isDragging && 'border-border bg-background-1 opacity-90'
      )}
    >
      <button
        type="button"
        className="flex size-6 shrink-0 cursor-grab items-center justify-center text-foreground-passive hover:text-foreground active:cursor-grabbing"
        aria-label={label}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" />
      </button>
      <span className="min-w-0 flex-1 truncate text-sm text-foreground">{label}</span>
      <Switch
        checked={visible}
        onCheckedChange={(checked) => sidebarStore.setNavItemHidden(itemKey, !checked)}
        aria-label={label}
      />
    </div>
  );
});
