import { useTranslation } from 'react-i18next';
import type { AgentAccountProviderId } from '@shared/runtime-registry';
import type { ConversationUsageSummary } from '@shared/stats';
import { Badge } from '@renderer/lib/ui/badge';
import { formatCompactNumber } from '@renderer/utils/format-compact-number';
import { tokenBreakdownTitle } from './task-stats-strip';

const AUTH_PROVIDER_LABEL_KEYS: Record<AgentAccountProviderId, string> = {
  'official-subscription': 'tasks.overview.stats.authProvider.official-subscription',
  'official-api': 'tasks.overview.stats.authProvider.official-api',
  'yoda-maas': 'tasks.overview.stats.authProvider.yoda-maas',
};

/**
 * Compact per-session burn chip for the overview session rows: token total
 * plus the account mode the session ran under. Renders nothing when the
 * provider has no parseable transcript.
 */
export function SessionUsageChip({ usage }: { usage: ConversationUsageSummary | undefined }) {
  const { t } = useTranslation();
  if (!usage?.tokens) return null;

  return (
    <span className="flex shrink-0 items-center gap-1.5">
      {usage.authProvider && (
        <Badge variant="secondary">{t(AUTH_PROVIDER_LABEL_KEYS[usage.authProvider])}</Badge>
      )}
      <span
        className="font-mono text-xs tabular-nums text-foreground-passive"
        title={tokenBreakdownTitle(usage.tokens, t)}
      >
        {t('tasks.overview.stats.tokens', { value: formatCompactNumber(usage.tokens.total) })}
      </span>
    </span>
  );
}
