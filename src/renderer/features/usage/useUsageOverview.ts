import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { agentSessionExitedChannel } from '@shared/events/agentEvents';
import { events, rpc } from '@renderer/lib/ipc';

const USAGE_OVERVIEW_KEY = ['usage', 'overview'] as const;

/**
 * Lifetime usage rollup for the Usage view, or one project's slice when
 * `projectId` is given. The first fetch parses all historical transcripts in
 * the main process; afterwards the mtime cache makes refetches cheap, so
 * agent-exit invalidation is affordable.
 */
export function useUsageOverview(projectId?: string) {
  const queryClient = useQueryClient();

  useEffect(() => {
    return events.on(agentSessionExitedChannel, () => {
      // Prefix match — invalidates the global and every project-scoped query.
      void queryClient.invalidateQueries({ queryKey: USAGE_OVERVIEW_KEY });
    });
  }, [queryClient]);

  return useQuery({
    queryKey: [...USAGE_OVERVIEW_KEY, projectId ?? 'all'],
    queryFn: () => rpc.stats.getUsageOverview(projectId),
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    // The full-history parse is expensive — surface failures instead of
    // silently re-running it through the default retry ladder.
    retry: 1,
  });
}
