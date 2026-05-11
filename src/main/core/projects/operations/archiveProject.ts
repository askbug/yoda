import { eq, sql } from 'drizzle-orm';
import { projectEvents } from '@main/core/projects/project-events';
import { projectManager } from '@main/core/projects/project-manager';
import { getTasks } from '@main/core/tasks/operations/getTasks';
import { taskManager } from '@main/core/tasks/task-manager';
import { db } from '@main/db/client';
import { projects } from '@main/db/schema';
import { log } from '@main/lib/logger';
import { telemetryService } from '@main/lib/telemetry';

export async function archiveProject(id: string): Promise<void> {
  const provider = projectManager.getProject(id);
  if (provider) {
    const projectTasks = await getTasks(id);
    await Promise.allSettled(projectTasks.map((t) => taskManager.teardownTask(t.id, 'terminate')));
  }

  await db
    .update(projects)
    .set({
      archivedAt: sql`CURRENT_TIMESTAMP`,
      updatedAt: sql`CURRENT_TIMESTAMP`,
    })
    .where(eq(projects.id, id));

  const closeResult = await projectManager.closeProject(id);
  if (!closeResult.success) {
    log.warn('archiveProject: closeProject failed', {
      projectId: id,
      error: closeResult.error.message,
    });
  }

  projectEvents._emit('project:archived', id);
  telemetryService.capture('project_archived', { project_id: id });
}
