import { and, eq, sql } from 'drizzle-orm';
import { conversationArchivedChannel } from '@shared/events/conversationEvents';
import { projectManager } from '@main/core/projects/project-manager';
import type { ProjectProvider } from '@main/core/projects/project-provider';
import { resolveTask } from '@main/core/projects/utils';
import { providerOverrideSettings } from '@main/core/settings/provider-settings-service';
import { db } from '@main/db/client';
import {
  conversations,
  projects,
  tasks,
  type ConversationRow,
  type TaskRow,
} from '@main/db/schema';
import { events } from '@main/lib/events';
import { log } from '@main/lib/logger';
import { telemetryService } from '@main/lib/telemetry';
import { ensureCodexThreadArchived } from './codex-archive';
import { resolveAgentResumeSessionId } from './codex-session-id';
import { conversationEvents } from './conversation-events';
import { mapConversationRowToConversation } from './utils';

export async function archiveConversation(
  projectId: string,
  taskId: string,
  conversationId: string
): Promise<void> {
  const [row] = await db
    .select({
      conversation: conversations,
      task: tasks,
      projectPath: projects.path,
    })
    .from(conversations)
    .innerJoin(tasks, eq(conversations.taskId, tasks.id))
    .innerJoin(projects, eq(tasks.projectId, projects.id))
    .where(
      and(
        eq(conversations.id, conversationId),
        eq(conversations.projectId, projectId),
        eq(conversations.taskId, taskId)
      )
    )
    .limit(1);
  if (!row) return;

  await db
    .update(conversations)
    .set({
      archivedAt: sql`CURRENT_TIMESTAMP`,
      updatedAt: sql`CURRENT_TIMESTAMP`,
    })
    .where(
      and(
        eq(conversations.id, conversationId),
        eq(conversations.projectId, projectId),
        eq(conversations.taskId, taskId)
      )
    );

  await archiveCodexConversation({
    conversation: row.conversation,
    task: row.task,
    projectPath: row.projectPath,
    project: projectManager.getProject(projectId),
  }).catch((error: unknown) => {
    log.warn('archiveConversation: Codex session archive failed', {
      conversationId,
      error: String(error),
    });
  });

  const task = resolveTask(projectId, taskId);
  await task?.conversations.stopSession(conversationId);

  conversationEvents._emit('conversation:archived', conversationId, projectId, taskId);
  events.emit(conversationArchivedChannel, { conversationId, projectId, taskId });
  telemetryService.capture('conversation_archived', {
    project_id: projectId,
    task_id: taskId,
    conversation_id: conversationId,
  });
}

async function archiveCodexConversation({
  conversation,
  task,
  project,
  projectPath,
}: {
  conversation: ConversationRow;
  task: TaskRow;
  project: ProjectProvider | undefined;
  projectPath: string;
}): Promise<void> {
  if (!project || conversation.provider !== 'codex') return;

  const cwd = await resolveTaskCwd({ task, project, projectPath });
  const providerConfig = await providerOverrideSettings.getItem('codex');
  const mappedConversation = mapConversationRowToConversation(conversation, true);
  const threadId = resolveAgentResumeSessionId(mappedConversation, cwd);
  await ensureCodexThreadArchived({
    providerId: mappedConversation.providerId,
    providerConfig,
    threadId,
    ctx: project.ctx,
  });
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
    log.warn('archiveConversation: failed to resolve task worktree for Codex archive', {
      taskId: task.id,
      error: String(error),
    });
    return projectPath;
  }
}
