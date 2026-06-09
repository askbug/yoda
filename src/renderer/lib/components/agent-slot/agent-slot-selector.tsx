import { Check, ChevronDown, Plus, Settings2 } from 'lucide-react';
import { useState, type ComponentType, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { Agent } from '@shared/agents';
import { Popover, PopoverContent, PopoverTrigger } from '@renderer/lib/ui/popover';
import { cn } from '@renderer/utils/utils';

interface AgentSlotSelectorProps {
  /** Currently selected Agent, or null when none is chosen yet. */
  selectedAgent: Agent | null;
  agents: Agent[];
  onSelectAgent: (agentId: string) => void;
  onCreateAgent: () => void;
  onManageAgents: () => void;
  className?: string;
}

/**
 * Slot picker. A slot is an assignment of one **Agent** — the entity that owns a
 * system prompt, skills, and a preferred runtime. The picker therefore lists
 * Agents only; runtime is a field of an Agent, not a peer choice here. When no
 * Agents exist the only path forward is to create one.
 */
export function AgentSlotSelector({
  selectedAgent,
  agents,
  onSelectAgent,
  onCreateAgent,
  onManageAgents,
  className,
}: AgentSlotSelectorProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const q = query.trim().toLowerCase();
  const filtered = q
    ? agents.filter(
        (a) => a.name.toLowerCase().includes(q) || a.description.toLowerCase().includes(q)
      )
    : agents;

  const pick = (agentId: string) => {
    onSelectAgent(agentId);
    setOpen(false);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setQuery('');
      }}
    >
      <PopoverTrigger
        render={
          <button
            type="button"
            className={cn(
              'flex h-9 w-full min-w-0 items-center gap-2 rounded-md border border-border bg-transparent px-2.5 py-1 text-sm outline-none transition-colors hover:bg-background-2',
              className
            )}
          >
            {selectedAgent ? (
              <>
                <span className="flex size-4 shrink-0 items-center justify-center text-[13px] leading-none">
                  {selectedAgent.icon || '🤖'}
                </span>
                <span className="flex-1 truncate text-left">{selectedAgent.name}</span>
              </>
            ) : (
              <span className="flex-1 truncate text-left text-foreground-muted">
                {t('home.slotPickAgent')}
              </span>
            )}
            <ChevronDown className="size-3.5 shrink-0 text-foreground-muted" />
          </button>
        }
      />
      <PopoverContent
        align="start"
        className="flex max-h-(--available-height) w-(--anchor-width) min-w-72 flex-col gap-0 overflow-hidden p-0"
      >
        {agents.length > 0 && (
          <div className="border-b border-border/60 p-2">
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('agents.searchAgents')}
              className="h-8 w-full rounded-md border border-border bg-background px-2.5 text-xs outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-1">
          {agents.length === 0 ? (
            <p className="px-3 py-4 text-center text-xs text-foreground-muted">
              {t('home.slotNoAgents')}
            </p>
          ) : filtered.length === 0 ? (
            <p className="px-3 py-4 text-center text-xs text-foreground-muted">
              {t('home.slotNoResults')}
            </p>
          ) : (
            filtered.map((agent) => {
              const active = selectedAgent?.id === agent.id;
              return (
                <Row key={agent.id} active={active} onClick={() => pick(agent.id)}>
                  <span className="flex size-4 shrink-0 items-center justify-center text-[13px] leading-none">
                    {agent.icon || '🤖'}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate">{agent.name}</span>
                    {agent.description && (
                      <span className="truncate text-xs text-foreground-muted">
                        {agent.description}
                      </span>
                    )}
                  </span>
                  {active && <Check className="size-3.5 shrink-0 text-primary" />}
                </Row>
              );
            })
          )}
        </div>
        <div className="flex items-center gap-1 border-t border-border/60 p-1">
          <ActionButton
            icon={Plus}
            label={t('home.slotNewAgent')}
            onClick={() => {
              setOpen(false);
              onCreateAgent();
            }}
          />
          <ActionButton
            icon={Settings2}
            label={t('home.slotManageAgents')}
            onClick={() => {
              setOpen(false);
              onManageAgents();
            }}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}

function Row({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors',
        active ? 'text-primary' : 'text-foreground hover:bg-background-2'
      )}
    >
      {children}
    </button>
  );
}

function ActionButton({
  icon: Icon,
  label,
  onClick,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md text-xs text-foreground-muted transition-colors hover:bg-background-2 hover:text-foreground"
    >
      <Icon className="size-3.5" />
      <span className="truncate">{label}</span>
    </button>
  );
}
