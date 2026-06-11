import { ChevronRight, Copy, Eye } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { TaskNamingContextSnapshot, TaskNamingContextSource } from '@shared/task-naming';
import { PersistedDetails } from '@renderer/features/tasks/components/persisted-disclosure';
import { Button } from '@renderer/lib/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@renderer/lib/ui/popover';
import { cn } from '@renderer/utils/utils';

const MAX_REASONABLE_NAMING_DURATION_MS = 10 * 60 * 1000;

export type NamingDebugContextStats = {
  sources: number;
  tokens: number;
  characters: number;
  method: string;
};

export type NamingDebugSummaryItem =
  | {
      kind?: 'value';
      key?: string;
      label: string;
      value?: string;
      mono?: boolean;
      accent?: boolean;
    }
  | {
      kind: 'divider';
      key?: string;
    };

export type NamingDebugTextSection = {
  id: string;
  label: string;
  text?: string;
  tokenLabel?: string;
  maxHeightClassName?: string;
};

export type NamingDebugContextSection = {
  title: string;
  statsLabel: string;
  isLoading?: boolean;
  loadingLabel: string;
  sources?: TaskNamingContextSource[] | null;
  emptyContent: ReactNode;
  previewHint?: ReactNode;
  sourceIdPrefix: string;
  sourceTokenLabel: (source: TaskNamingContextSource) => string;
  truncatedLabel?: string;
};

export function NamingDebugContent({
  children,
  chromeless = false,
}: {
  children: ReactNode;
  chromeless?: boolean;
}) {
  return (
    <div
      className={cn('min-h-0 min-w-0 flex-1 overflow-y-auto px-2.5', chromeless ? 'py-2' : 'py-3')}
    >
      <div className={cn('flex min-w-0 flex-col', chromeless ? 'gap-2' : 'gap-3')}>{children}</div>
    </div>
  );
}

export type NamingDebugSectionLabels = {
  basics: string;
  configuration: string;
};

export function NamingDebugPanel({
  summaryItems,
  error,
  actions,
  configuration,
  textSections = [],
  context,
  sectionLabels,
}: {
  summaryItems: NamingDebugSummaryItem[];
  error?: {
    message?: string;
    copyLabel?: string;
    onCopy?: () => void;
  };
  /** Primary action(s), pinned to the bottom of the scroll area. */
  actions?: ReactNode;
  configuration?: ReactNode;
  textSections?: NamingDebugTextSection[];
  context: NamingDebugContextSection;
  sectionLabels: NamingDebugSectionLabels;
}) {
  const sources = context.sources ?? [];
  const promptSections = textSections.filter((section) => section.text);
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-3">
      <NamingDebugSection title={sectionLabels.basics}>
        <NamingDebugSummaryCard>
          {summaryItems.map((item, index) =>
            item.kind === 'divider' ? (
              <NamingDebugDivider key={item.key ?? `divider-${index}`} />
            ) : (
              <NamingDebugValue
                key={item.key ?? item.label}
                label={item.label}
                value={item.value}
                mono={item.mono}
                accent={item.accent}
              />
            )
          )}
        </NamingDebugSummaryCard>
      </NamingDebugSection>

      {configuration ? (
        <NamingDebugSection title={sectionLabels.configuration}>{configuration}</NamingDebugSection>
      ) : null}

      <NamingDebugSection
        title={context.title}
        subtitle={context.isLoading ? context.loadingLabel : context.statsLabel}
      >
        {context.isLoading ? (
          <NamingDebugEmpty>{context.loadingLabel}</NamingDebugEmpty>
        ) : sources.length ? (
          <div className="flex min-w-0 flex-col gap-1.5">
            {context.previewHint}
            {sources.map((source) => (
              <NamingDebugSourceDetails
                key={source.id}
                id={`${context.sourceIdPrefix}:source:${source.id}`}
                source={source}
                tokenLabel={context.sourceTokenLabel(source)}
                truncatedLabel={context.truncatedLabel}
              />
            ))}
          </div>
        ) : (
          <NamingDebugEmpty>{context.emptyContent}</NamingDebugEmpty>
        )}
      </NamingDebugSection>

      {actions || error?.message ? (
        <div className="sticky bottom-0 z-10 -mx-2.5 mt-auto flex flex-col gap-1.5 border-t border-border/70 bg-background-quaternary px-2.5 pb-0.5 pt-2">
          {error?.message ? (
            <NamingDebugError
              message={error.message}
              copyLabel={error.copyLabel}
              onCopy={error.onCopy}
            />
          ) : null}
          <div className="flex items-center gap-1.5">
            {promptSections.length ? <NamingDebugPromptPreview sections={promptSections} /> : null}
            <div className="min-w-0 flex-1">{actions}</div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function NamingDebugPromptPreview({ sections }: { sections: NamingDebugTextSection[] }) {
  const { t } = useTranslation();
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button type="button" size="xs" variant="outline" className="h-7 shrink-0 gap-1.5">
            <Eye className="size-3" />
            {t('tasks.rename.previewPrompt')}
          </Button>
        }
      />
      <PopoverContent
        align="start"
        side="top"
        className="flex max-h-[60vh] w-96 flex-col gap-1.5 overflow-y-auto p-2"
      >
        {sections.map((section) => (
          <div key={section.id} className="flex min-w-0 flex-col gap-1">
            <div className="flex min-w-0 items-center gap-1.5">
              <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
                {section.label}
              </span>
              {section.tokenLabel ? (
                <span className="shrink-0 text-[11px] text-foreground-passive">
                  {section.tokenLabel}
                </span>
              ) : null}
            </div>
            <pre className="max-h-60 overflow-auto whitespace-pre-wrap break-words rounded-md border border-dashed border-border/80 bg-background-1/40 p-2 text-[11px] leading-relaxed text-foreground-muted">
              {section.text}
            </pre>
          </div>
        ))}
      </PopoverContent>
    </Popover>
  );
}

function NamingDebugSection({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <section className="flex min-w-0 flex-col gap-1.5">
      <div className="min-w-0 px-0.5">
        <span className="block truncate text-[10px] font-medium uppercase tracking-wide text-foreground-passive">
          {title}
        </span>
        {subtitle ? (
          <p className="mt-0.5 truncate text-[11px] text-foreground-passive">{subtitle}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

export function NamingDebugSummaryCard({ children }: { children: ReactNode }) {
  return (
    <div className="grid gap-1 rounded-md border border-border bg-background-1/40 px-2 py-1.5">
      {children}
    </div>
  );
}

export function NamingDebugValue({
  label,
  value,
  mono,
  accent,
}: {
  label: string;
  value?: string;
  mono?: boolean;
  accent?: boolean;
}) {
  if (!value) return null;
  return (
    <div className="grid min-w-0 grid-cols-[5.5rem_minmax(0,1fr)] gap-2 text-[11px] leading-tight">
      <span className="shrink-0 truncate text-foreground-passive" title={label}>
        {label}
      </span>
      <span
        className={cn(
          'min-w-0 truncate text-foreground-muted',
          mono && 'font-mono',
          accent && 'font-medium text-foreground'
        )}
        title={value}
      >
        {value}
      </span>
    </div>
  );
}

export function NamingDebugDivider() {
  return <div className="my-0.5 h-px bg-border/60" />;
}

export function NamingDebugEmpty({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-md border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
      {children}
    </div>
  );
}

export function NamingDebugError({
  message,
  copyLabel,
  onCopy,
}: {
  message: string;
  copyLabel?: string;
  onCopy?: () => void;
}) {
  return (
    <div className="rounded-md border border-border-destructive/60 bg-background-destructive/40 p-2 text-xs leading-relaxed text-foreground-destructive">
      <div className="flex min-w-0 items-start justify-between gap-2">
        <span className="min-w-0 whitespace-pre-wrap break-words">{message}</span>
        {onCopy ? (
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            className="-mr-1 -mt-1 text-foreground-destructive hover:bg-background-destructive/60 hover:text-foreground-destructive"
            aria-label={copyLabel}
            title={copyLabel}
            onClick={onCopy}
          >
            <Copy className="size-3" />
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export function NamingDebugSourceDetails({
  id,
  source,
  tokenLabel,
  truncatedLabel,
}: {
  id: string;
  source: TaskNamingContextSource;
  tokenLabel: string;
  truncatedLabel?: string;
}) {
  return (
    <PersistedDetails
      id={id}
      className="group rounded-md border border-dashed border-border/80 bg-background-1/40 p-2"
      summary={
        <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs text-foreground [&::-webkit-details-marker]:hidden">
          <ChevronRight className="size-3 shrink-0 transition-transform group-open:rotate-90" />
          <span className="min-w-0 flex-1 truncate">{source.label}</span>
          <span className="shrink-0 text-[11px] text-foreground-passive">{tokenLabel}</span>
          {source.truncated && truncatedLabel ? (
            <span className="shrink-0 text-[11px] text-foreground-passive">{truncatedLabel}</span>
          ) : null}
        </summary>
      }
    >
      <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words text-[11px] leading-relaxed text-foreground-muted">
        {source.content}
      </pre>
    </PersistedDetails>
  );
}

export function getNamingDebugContextStats(
  context: TaskNamingContextSnapshot | null
): NamingDebugContextStats | null {
  if (!context) return null;
  const sources = context.sourceCount ?? context.sources.length;
  const tokens =
    context.estimatedTokens ??
    context.sources.reduce((sum, source) => sum + source.estimatedTokens, 0);
  const characters =
    context.estimatedCharacters ??
    context.sources.reduce((sum, source) => sum + source.content.length, 0);
  return {
    sources,
    tokens,
    characters,
    method: context.generationMethod ?? '-',
  };
}

export function getNamingDebugDurationEstimate(input: {
  status?: string;
  createdAt?: string;
  updatedAt?: string;
  traceDurationMs?: number;
  isRunning?: boolean;
  nowMs: number;
  fallbackDurationMs?: number | null;
}): { duration: string; running: boolean } | null {
  const startedAt = parseNamingDebugTimestamp(input.createdAt);
  if (input.isRunning) {
    if (startedAt !== null) {
      return { duration: formatNamingDebugDurationMs(input.nowMs - startedAt), running: true };
    }
    if (input.fallbackDurationMs !== undefined && input.fallbackDurationMs !== null) {
      return {
        duration: formatNamingDebugDurationMs(input.fallbackDurationMs),
        running: true,
      };
    }
  }

  if (input.status === 'generating' && startedAt !== null) {
    return { duration: formatNamingDebugDurationMs(input.nowMs - startedAt), running: true };
  }

  if (input.fallbackDurationMs !== undefined && input.fallbackDurationMs !== null) {
    return {
      duration: formatNamingDebugDurationMs(input.fallbackDurationMs),
      running: false,
    };
  }

  if (typeof input.traceDurationMs === 'number') {
    return { duration: formatNamingDebugDurationMs(input.traceDurationMs), running: false };
  }

  const updatedAt = parseNamingDebugTimestamp(input.updatedAt);
  if (startedAt !== null && updatedAt !== null) {
    const durationMs = updatedAt - startedAt;
    if (durationMs >= 0 && durationMs <= MAX_REASONABLE_NAMING_DURATION_MS) {
      return { duration: formatNamingDebugDurationMs(durationMs), running: false };
    }
  }

  return null;
}

export function formatNamingDebugTokenCount(value: number | undefined): string {
  if (value === undefined) return '-';
  return String(value);
}

export function formatNamingDebugDurationMs(durationMs: number): string {
  if (durationMs < 1_000) return '<1s';
  const totalSeconds = Math.max(1, Math.round(durationMs / 1_000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${seconds.toString().padStart(2, '0')}s`;
}

function parseNamingDebugTimestamp(value: string | undefined): number | null {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}
