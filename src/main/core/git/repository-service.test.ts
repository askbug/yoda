import { describe, expect, it } from 'vitest';
import { ok } from '@shared/result';
import type { ProjectSettingsProvider } from '@main/core/projects/settings/provider';
import type { RepositoryGitProvider } from './repository-git-provider';
import { GitRepositoryService } from './repository-service';

function notGitError(message: string): Error & { stderr: string; stdout: string; code: number } {
  return Object.assign(new Error(message), {
    stdout: '',
    stderr: `${message}\n`,
    code: 128,
  });
}

function makeSettings(): ProjectSettingsProvider {
  return {
    getDefaultBranch: async () => 'main',
    getRemote: async () => 'origin',
    getDefaultWorktreeDirectory: async () => '/tmp/worktrees',
    getWorktreeDirectory: async () => '/tmp/worktrees',
    get: async () => ({}),
    update: async () => ({ success: true, data: undefined }),
    patch: async () => ({ success: true, data: undefined }),
    ensure: async () => {},
  };
}

function makeGit(overrides: Partial<RepositoryGitProvider> = {}): RepositoryGitProvider {
  return {
    getBranches: async () => [],
    getCurrentBranch: async () => null,
    getHeadState: async () => ({ isUnborn: true }),
    getDefaultBranch: async () => 'main',
    getRemotes: async () => [],
    addRemote: async () => {},
    createBranch: async () => ok(),
    renameBranch: async () => ({ success: true, data: { remotePushed: false } }),
    deleteBranch: async () => ok(),
    fetchPrForReview: async () => ok(),
    fetch: async () => ok(),
    publishBranch: async () => ({ success: true, data: { output: '' } }),
    ...overrides,
  };
}

describe('GitRepositoryService', () => {
  it('treats localized Chinese non-repository errors as an unborn local branch state', async () => {
    const service = new GitRepositoryService(
      makeGit({
        getBranches: async () => {
          throw notGitError('致命错误：不是 git 仓库（或者任何父目录）：.git');
        },
      }),
      makeSettings()
    );

    await expect(service.getLocalBranchesPayload()).resolves.toEqual({
      localBranches: [],
      currentBranch: null,
      isUnborn: true,
    });
  });

  it('treats localized Chinese non-repository errors as an empty remote branch state', async () => {
    const service = new GitRepositoryService(
      makeGit({
        getBranches: async () => {
          throw notGitError('致命错误：不是 git 仓库（或者任何父目录）：.git');
        },
      }),
      makeSettings()
    );

    await expect(service.getRemoteBranchesPayload()).resolves.toEqual({
      remoteBranches: [],
      remotes: [],
      gitDefaultBranch: '',
    });
  });
});
