import { and, eq, inArray } from 'drizzle-orm';
import type { AgentAccountProviderId } from '@shared/runtime-registry';
import {
  addTokenBuckets,
  emptyTokenBuckets,
  type AuthProviderUsage,
  type DailyTokenUsage,
  type RuntimeUsage,
  type TaskUsage,
  type TokenBuckets,
  type UsageOverview,
} from '@shared/stats';
import { runtimeOverrideSettings } from '@main/core/settings/runtime-settings-service';
import { db } from '@main/db/client';
import { conversations, projects, tasks } from '@main/db/schema';
import { log } from '@main/lib/logger';
import { resolveTaskCwd } from './task-cwd';
import { getTaskDiffTotals } from './task-diff-snapshot';
import { TRANSCRIPT_USAGE_PROVIDER_IDS } from './transcript-readers/registry';
import { sessionUsageCache } from './usage-cache';

const TOP_TASKS_LIMIT = 10;
const PARSE_CONCURRENCY = 8;

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await fn(items[index]!);
      }
    })
  );
  return results;
}

/**
 * Lifetime usage rollup for the Usage view — one call returns totals, the
 * per-local-day series (heatmap), and runtime / auth-source / per-task
 * breakdowns. Token data comes from parsing every readable session
 * transcript (claude + codex); the first call pays the full parse, the mtime
 * cache makes subsequent calls cheap. Pass `projectId` to scope every number
 * to one project (used by the project overview).
 */
export async function getUsageOverview(projectId?: string): Promise<UsageOverview> {
  const allTasks = projectId
    ? await db.select().from(tasks).where(eq(tasks.projectId, projectId))
    : await db.select().from(tasks);
  const tasksArchived = allTasks.filter((task) => task.archivedAt !== null).length;

  const diffTotals = await Promise.all(allTasks.map((task) => getTaskDiffTotals(task)));
  let linesAdded = 0;
  let linesDeleted = 0;
  for (const { totals } of diffTotals) {
    linesAdded += totals.additions;
    linesDeleted += totals.deletions;
  }

  const rows = await db
    .select({ conversation: conversations, task: tasks, projectPath: projects.path })
    .from(conversations)
    .innerJoin(tasks, eq(conversations.taskId, tasks.id))
    .innerJoin(projects, eq(conversations.projectId, projects.id))
    .where(
      projectId
        ? and(
            inArray(conversations.runtime, TRANSCRIPT_USAGE_PROVIDER_IDS),
            eq(conversations.projectId, projectId)
          )
        : inArray(conversations.runtime, TRANSCRIPT_USAGE_PROVIDER_IDS)
    );

  // Many conversations share a task — resolve each task's cwd once.
  const cwdByTask = new Map<string, Promise<string>>();
  const startedAtMs = Date.now();
  const usages = await mapWithConcurrency(
    rows,
    PARSE_CONCURRENCY,
    ({ conversation, task, projectPath }) => {
      let cwd = cwdByTask.get(task.id);
      if (!cwd) {
        cwd = resolveTaskCwd(task, projectPath);
        cwdByTask.set(task.id, cwd);
      }
      return cwd.then((resolvedCwd) =>
        sessionUsageCache.getUsage(conversation.runtime, {
          cwd: resolvedCwd,
          conversationId: conversation.id,
          conversationTitle: conversation.title,
          conversationCreatedAt: conversation.createdAt,
        })
      );
    }
  );
  log.info('stats: usage overview transcripts parsed', {
    conversations: rows.length,
    parsed: usages.filter(Boolean).length,
    ms: Date.now() - startedAtMs,
  });

  // Sessions spawned before auth tracking landed have no recorded mode —
  // attribute them to the runtime's CURRENT configured mode (an estimate,
  // far more useful than an "untracked" bucket).
  const fallbackAuthByRuntime = new Map<string, AgentAccountProviderId>();
  for (const runtimeId of TRANSCRIPT_USAGE_PROVIDER_IDS) {
    const config = await runtimeOverrideSettings.getItem(runtimeId);
    fallbackAuthByRuntime.set(runtimeId, config?.authProvider ?? 'official-subscription');
  }

  let tokens: TokenBuckets | null = null;
  const dailyByDate = new Map<string, TokenBuckets>();
  const byRuntime = new Map<string, RuntimeUsage>();
  const byAuthProvider = new Map<string, AuthProviderUsage>();
  const tokensByTask = new Map<string, TokenBuckets>();

  for (let index = 0; index < rows.length; index++) {
    const { conversation, task } = rows[index]!;
    const usage = usages[index];
    if (!usage) continue;

    tokens = addTokenBuckets(tokens ?? emptyTokenBuckets(), usage.total);

    for (const day of usage.daily) {
      const bucket = dailyByDate.get(day.date);
      if (bucket) addTokenBuckets(bucket, day.tokens);
      else dailyByDate.set(day.date, { ...day.tokens });
    }

    const runtimeId = conversation.runtime ?? 'unknown';
    const runtimeUsage = byRuntime.get(runtimeId);
    if (runtimeUsage) {
      addTokenBuckets(runtimeUsage.tokens, usage.total);
      runtimeUsage.sessionCount += 1;
    } else {
      byRuntime.set(runtimeId, {
        runtimeId,
        tokens: { ...usage.total },
        sessionCount: 1,
      });
    }

    const authProvider =
      conversation.authProvider ?? fallbackAuthByRuntime.get(runtimeId) ?? 'official-subscription';
    const authUsage = byAuthProvider.get(authProvider);
    if (authUsage) addTokenBuckets(authUsage.tokens, usage.total);
    else byAuthProvider.set(authProvider, { authProvider, tokens: { ...usage.total } });

    const taskTokens = tokensByTask.get(task.id);
    if (taskTokens) addTokenBuckets(taskTokens, usage.total);
    else tokensByTask.set(task.id, { ...usage.total });
  }

  const taskById = new Map(allTasks.map((task) => [task.id, task]));
  const topTasks: TaskUsage[] = [...tokensByTask.entries()]
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, TOP_TASKS_LIMIT)
    .flatMap(([taskId, taskTokens]) => {
      const task = taskById.get(taskId);
      if (!task) return [];
      return [
        {
          taskId,
          projectId: task.projectId,
          name: task.name,
          archived: task.archivedAt !== null,
          tokens: taskTokens,
        },
      ];
    });

  const daily: DailyTokenUsage[] = [...dailyByDate.entries()]
    .map(([date, dayTokens]) => ({ date, tokens: dayTokens }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    tasksTotal: allTasks.length,
    tasksArchived,
    linesAdded,
    linesDeleted,
    tokens,
    daily,
    byRuntime: [...byRuntime.values()].sort((a, b) => b.tokens.total - a.tokens.total),
    byAuthProvider: [...byAuthProvider.values()].sort((a, b) => b.tokens.total - a.tokens.total),
    topTasks,
  };
}
