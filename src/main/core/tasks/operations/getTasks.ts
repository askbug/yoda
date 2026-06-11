import { and, count, desc, eq, inArray, isNull } from 'drizzle-orm';
import { type Task } from '@shared/tasks';
import { db } from '@main/db/client';
import { conversations, tasks } from '@main/db/schema';
import { mapTaskRowToTask } from '../utils/utils';
import { getIssuesForTasks } from './task-issues';

export async function getTasks(projectId?: string): Promise<Task[]> {
  const rows = projectId
    ? await db
        .select()
        .from(tasks)
        .where(and(eq(tasks.projectId, projectId)))
        .orderBy(desc(tasks.updatedAt))
    : await db.select().from(tasks).orderBy(desc(tasks.updatedAt));

  if (rows.length === 0) return [];

  const taskIds = rows.map((r) => r.id);

  const convRows = await db
    .select({
      taskId: conversations.taskId,
      runtime: conversations.runtime,
      count: count(),
    })
    .from(conversations)
    .where(and(inArray(conversations.taskId, taskIds), isNull(conversations.archivedAt)))
    .groupBy(conversations.taskId, conversations.runtime);

  const convByTask = new Map<string, Record<string, number>>();
  const issuesByTask = await getIssuesForTasks(taskIds);
  for (const { taskId, runtime, count: c } of convRows) {
    const rec = convByTask.get(taskId) ?? {};
    rec[runtime ?? 'unknown'] = c;
    convByTask.set(taskId, rec);
  }

  return rows.map((row) => ({
    ...mapTaskRowToTask(row, [], convByTask.get(row.id) ?? {}, issuesByTask.get(row.id)),
    prs: [],
  }));
}
