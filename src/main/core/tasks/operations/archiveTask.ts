import { and, eq, isNull, sql } from 'drizzle-orm';
import { ensureCodexThreadArchived } from '@main/core/conversations/codex-archive';
import { resolveAgentResumeSessionId } from '@main/core/conversations/codex-session-id';
import { mapConversationRowToConversation } from '@main/core/conversations/utils';
import { projectManager } from '@main/core/projects/project-manager';
import type { ProjectProvider } from '@main/core/projects/project-provider';
import { providerOverrideSettings } from '@main/core/settings/provider-settings-service';
import { taskEvents } from '@main/core/tasks/task-events';
import { taskManager } from '@main/core/tasks/task-manager';
import { db } from '@main/db/client';
import { conversations, projects, tasks, type TaskRow } from '@main/db/schema';
import { log } from '@main/lib/logger';
import { telemetryService } from '@main/lib/telemetry';

export async function archiveTask(projectId: string, taskId: string, note?: string): Promise<void> {
  const [row] = await db
    .select({
      task: tasks,
      projectPath: projects.path,
    })
    .from(tasks)
    .innerJoin(projects, eq(tasks.projectId, projects.id))
    .where(and(eq(tasks.id, taskId), eq(tasks.projectId, projectId)))
    .limit(1);
  if (!row) return;

  const task = row.task;
  const project = projectManager.getProject(projectId);

  const trimmedNote = note?.trim();
  await db
    .update(tasks)
    .set({
      status: 'archived',
      archivedAt: sql`CURRENT_TIMESTAMP`,
      archiveNote: trimmedNote && trimmedNote.length > 0 ? trimmedNote : null,
      updatedAt: sql`CURRENT_TIMESTAMP`,
      statusChangedAt: sql`CURRENT_TIMESTAMP`,
    })
    .where(eq(tasks.id, taskId));
  taskEvents._emit('task:archived', taskId, projectId);
  telemetryService.capture('task_archived', {
    project_id: projectId,
    task_id: taskId,
    has_note: Boolean(trimmedNote && trimmedNote.length > 0),
  });

  await archiveCodexTaskConversations({
    projectId,
    task,
    project,
    projectPath: row.projectPath,
  }).catch((error: unknown) => {
    log.warn('archiveTask: Codex session archive failed', {
      taskId,
      error: String(error),
    });
  });

  if (!project) return;

  void taskManager
    .teardownTask(taskId, 'terminate')
    .then((teardownResult) => {
      if (!teardownResult.success) {
        log.warn('archiveTask: teardown failed', { taskId, error: teardownResult.error.message });
      }
    })
    .catch((e: unknown) => {
      log.warn('archiveTask: teardown failed', { taskId, error: String(e) });
    });

  if (task.taskBranch) {
    const siblings = await db
      .select({ id: tasks.id })
      .from(tasks)
      .where(
        and(
          eq(tasks.projectId, task.projectId),
          eq(tasks.taskBranch, task.taskBranch),
          isNull(tasks.archivedAt)
        )
      )
      .limit(1);

    if (siblings.length === 0) {
      await project.removeTaskWorktree(task.taskBranch).catch((e) => {
        log.warn('archiveTask: worktree removal failed', { taskId, error: String(e) });
      });
    }
  }
}

async function archiveCodexTaskConversations({
  projectId,
  task,
  project,
  projectPath,
}: {
  projectId: string;
  task: TaskRow;
  project: ProjectProvider | undefined;
  projectPath: string;
}): Promise<void> {
  if (!project) return;

  const codexConversations = await db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.projectId, projectId),
        eq(conversations.taskId, task.id),
        eq(conversations.provider, 'codex')
      )
    );

  if (codexConversations.length === 0) return;

  const cwd = await resolveTaskCwd({ task, project, projectPath });
  const providerConfig = await providerOverrideSettings.getItem('codex');
  await Promise.all(
    codexConversations.map((row) => {
      const conversation = mapConversationRowToConversation(row, true);
      const threadId = resolveAgentResumeSessionId(conversation, cwd);
      return ensureCodexThreadArchived({
        providerId: conversation.providerId,
        providerConfig,
        threadId,
        ctx: project.ctx,
      });
    })
  );
}

async function resolveTaskCwd({
  task,
  project,
  projectPath,
}: {
  task: TaskRow;
  project: ProjectProvider;
  projectPath: string;
}): Promise<string> {
  if (!task.taskBranch) return projectPath;

  try {
    return (await project.getWorktreeForBranch(task.taskBranch)) ?? projectPath;
  } catch (error) {
    log.warn('archiveTask: failed to resolve task worktree for Codex archive', {
      taskId: task.id,
      error: String(error),
    });
    return projectPath;
  }
}
