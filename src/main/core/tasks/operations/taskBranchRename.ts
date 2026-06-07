import { and, eq } from 'drizzle-orm';
import type { Branch, RenameBranchError } from '@shared/git';
import { err, ok, type Result } from '@shared/result';
import { deriveTaskSlug } from '@shared/task-name';
import type { ProjectProvider } from '@main/core/projects/project-provider';
import { db } from '@main/db/client';
import { tasks } from '@main/db/schema';
import { log } from '@main/lib/logger';
import { appSettingsService } from '../../settings/settings-service';
import { resolveTaskBranchName } from '../resolveTaskBranchName';

export function formatRenameBranchError(error: RenameBranchError): string {
  switch (error.type) {
    case 'already_exists':
      return `Branch "${error.name}" already exists.`;
    case 'remote_push_failed':
      return `Branch renamed locally, but pushing the renamed branch failed: ${error.message}`;
    default:
      return error.message;
  }
}

export async function renameTaskBranchForName(input: {
  project: ProjectProvider;
  projectId: string;
  taskId: string;
  oldBranch: string | null;
  sourceBranch: Branch | null;
  displayName: string;
}): Promise<Result<string | null, string>> {
  const { project, projectId, taskId, oldBranch, sourceBranch, displayName } = input;
  if (!oldBranch) return ok(null);
  if (sourceBranch && oldBranch === sourceBranch.branch) return ok(null);

  const siblings = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(and(eq(tasks.projectId, projectId), eq(tasks.taskBranch, oldBranch)))
    .limit(2);
  if (siblings.length !== 1 || siblings[0]?.id !== taskId) return ok(null);

  const branchSlug = deriveTaskSlug(displayName);
  if (!branchSlug) return ok(null);

  const suffix = Math.random().toString(36).slice(2, 7);
  const branchPrefix = (await appSettingsService.get('project')).branchPrefix ?? '';
  const newBranch = resolveTaskBranchName({
    rawBranch: branchSlug,
    branchPrefix,
    suffix,
  });

  if (newBranch === oldBranch) return ok(null);

  const renameResult = await project.repository.renameBranch(oldBranch, newBranch);
  if (!renameResult.success) {
    if (renameResult.error.type === 'remote_push_failed') {
      log.warn('taskBranchRename: remote push failed after local branch rename', {
        taskId,
        oldBranch,
        newBranch,
        error: renameResult.error.message,
      });
      return ok(newBranch);
    }
    return err(formatRenameBranchError(renameResult.error));
  }

  return ok(newBranch);
}
