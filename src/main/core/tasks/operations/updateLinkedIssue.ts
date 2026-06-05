import { eq } from 'drizzle-orm';
import { type Issue } from '@shared/tasks';
import { taskEvents } from '@main/core/tasks/task-events';
import { mapTaskRowToTask } from '@main/core/tasks/utils/utils';
import { db } from '@main/db/client';
import { tasks } from '@main/db/schema';
import { telemetryService } from '@main/lib/telemetry';
import { replaceTaskIssueLinks } from './task-issues';

export async function updateLinkedIssues(taskId: string, issues: Issue[] = []) {
  const [existingRow] = await db
    .select({ id: tasks.id, projectId: tasks.projectId })
    .from(tasks)
    .where(eq(tasks.id, taskId))
    .limit(1);
  if (!existingRow) return;

  const [updatedRow] = await replaceTaskIssueLinks(taskId, issues);

  if (updatedRow) {
    taskEvents._emit('task:updated', mapTaskRowToTask(updatedRow, [], {}, issues));
  }

  for (const issue of issues) {
    telemetryService.capture('issue_linked_to_task', {
      provider: issue.provider,
      project_id: existingRow.projectId,
      task_id: existingRow.id,
    });
  }
}

export async function updateLinkedIssue(taskId: string, issue?: Issue) {
  return updateLinkedIssues(taskId, issue ? [issue] : []);
}
