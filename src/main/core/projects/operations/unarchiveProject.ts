import { eq, sql } from 'drizzle-orm';
import { projectEvents } from '@main/core/projects/project-events';
import { db } from '@main/db/client';
import { projects } from '@main/db/schema';
import { telemetryService } from '@main/lib/telemetry';
import { getProjectById } from './getProjects';

export async function unarchiveProject(id: string): Promise<void> {
  await db
    .update(projects)
    .set({
      archivedAt: null,
      updatedAt: sql`CURRENT_TIMESTAMP`,
    })
    .where(eq(projects.id, id));

  const project = await getProjectById(id);
  if (!project) return;

  projectEvents._emit('project:unarchived', project);
  telemetryService.capture('project_unarchived', { project_id: id });
}
