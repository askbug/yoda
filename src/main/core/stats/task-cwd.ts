import { projectManager } from '@main/core/projects/project-manager';
import type { TaskRow } from '@main/db/schema';

/**
 * The cwd the agent CLI ran under — the task worktree when it exists, else
 * the project root. Transcript paths are keyed by this cwd (Claude encodes it
 * into `~/.claude/projects/<slug>/`), so for archived tasks whose worktree is
 * gone the transcript may no longer resolve; the usage cache keeps previously
 * resolved paths alive for the app session.
 */
export async function resolveTaskCwd(task: TaskRow, projectPath: string): Promise<string> {
  if (!task.taskBranch) return projectPath;
  // Archived tasks had their worktree removed — resolving would fall through
  // to a `git worktree list` exec per task, pure waste at rollup scale.
  if (task.archivedAt !== null) return projectPath;
  const project = projectManager.getProject(task.projectId);
  if (!project) return projectPath;
  try {
    return (await project.getWorktreeForBranch(task.taskBranch)) ?? projectPath;
  } catch {
    return projectPath;
  }
}
