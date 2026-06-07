import { randomUUID } from 'node:crypto';
import http from 'node:http';
import { networkInterfaces } from 'node:os';
import { URL } from 'node:url';
import { AGENT_PROVIDER_IDS, type AgentProviderId } from '@shared/agent-provider-registry';
import {
  createExpoGoPairingUrl,
  createMobilePairingUrl,
  MOBILE_APP_DEFAULT_INSTALL_URL,
  MOBILE_GATEWAY_DEFAULT_DEV_TOKEN,
  MOBILE_GATEWAY_DEFAULT_PORT,
  type MobileApiError,
  type MobileCreateDemandRequest,
  type MobileCreateDemandResponse,
  type MobileDashboardSnapshot,
  type MobileGatewayConnectionInfo,
  type MobileProjectSummary,
  type MobileTaskSummary,
} from '@shared/mobile-api';
import {
  INTERNAL_PROJECT_ID,
  projectDisplayName,
  type OpenProjectError,
  type Project,
} from '@shared/projects';
import { ensureUniqueTaskSlug, taskNameFromPrompt } from '@shared/task-name';
import type { CreateTaskError, CreateTaskWarning, Task } from '@shared/tasks';
import { getProjectById, getProjects } from '@main/core/projects/operations/getProjects';
import { openProject } from '@main/core/projects/operations/openProject';
import { projectManager } from '@main/core/projects/project-manager';
import { appSettingsService } from '@main/core/settings/settings-service';
import { generateTaskName } from '@main/core/tasks/name-generation/generateTaskName';
import { createTask } from '@main/core/tasks/operations/createTask';
import { getTasks } from '@main/core/tasks/operations/getTasks';
import { taskManager } from '@main/core/tasks/task-manager';
import { log } from '@main/lib/logger';

const MAX_BODY_BYTES = 128 * 1024;

class MobileGatewayError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string
  ) {
    super(message);
  }
}

function parseBooleanSetting(value: string | undefined): boolean | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return undefined;
}

function shouldStartGateway(): boolean {
  if (parseBooleanSetting(process.env.YODA_MOBILE_GATEWAY_DISABLED) === true) return false;

  const enabled = parseBooleanSetting(process.env.YODA_MOBILE_GATEWAY_ENABLED);
  if (enabled !== undefined) return enabled;

  const legacyEnabled = parseBooleanSetting(process.env.YODA_MOBILE_GATEWAY);
  return legacyEnabled !== false;
}

function parsePort(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? '', 10);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 65535) {
    return MOBILE_GATEWAY_DEFAULT_PORT;
  }
  return parsed;
}

function writeJson(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Yoda-Mobile-Token',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json',
  });
  res.end(JSON.stringify(body));
}

function writeError(res: http.ServerResponse, error: MobileGatewayError): void {
  const body: MobileApiError = {
    error: {
      code: error.code,
      message: error.message,
    },
  };
  writeJson(res, error.status, body);
}

function readJsonBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk: Buffer) => {
      body += chunk.toString('utf8');
      if (Buffer.byteLength(body, 'utf8') > MAX_BODY_BYTES) {
        reject(new MobileGatewayError(413, 'body_too_large', 'Request body is too large.'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!body.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new MobileGatewayError(400, 'invalid_json', 'Request body must be valid JSON.'));
      }
    });
    req.on('error', reject);
  });
}

function lanUrls(port: number): string[] {
  const urls: string[] = [];
  for (const iface of Object.values(networkInterfaces())) {
    for (const entry of iface ?? []) {
      if (entry.family === 'IPv4' && !entry.internal) {
        urls.push(`http://${entry.address}:${port}`);
      }
    }
  }
  return urls;
}

function mobileInstallUrl(): string {
  return process.env.YODA_MOBILE_INSTALL_URL?.trim() || MOBILE_APP_DEFAULT_INSTALL_URL;
}

function mobileGatewayToken(): string {
  const envToken = process.env.YODA_MOBILE_GATEWAY_TOKEN?.trim();
  if (envToken) return envToken;
  if (process.env.NODE_ENV !== 'production') return MOBILE_GATEWAY_DEFAULT_DEV_TOKEN;
  return randomUUID();
}

function localExpoUrl(primaryUrl: string, token: string): string | null {
  const override = process.env.YODA_MOBILE_EXPO_URL?.trim();
  if (override) return createExpoGoPairingUrl(override, { baseUrl: primaryUrl, token });
  if (process.env.NODE_ENV === 'production') return null;

  try {
    const host = new URL(primaryUrl).hostname;
    if (!host || host === 'localhost' || host === '127.0.0.1') return null;
    return createExpoGoPairingUrl(`exp://${host}:8081`, { baseUrl: primaryUrl, token });
  } catch {
    return null;
  }
}

function mapOpenProjectError(error: OpenProjectError): string {
  switch (error.type) {
    case 'path-not-found':
      return `Project path not found: ${error.path}`;
    case 'ssh-disconnected':
      return `SSH connection is disconnected: ${error.connectionId}`;
    case 'error':
      return error.message;
  }
}

function mapCreateTaskError(error: CreateTaskError): string {
  switch (error.type) {
    case 'project-not-found':
      return 'Project was not found.';
    case 'initial-commit-required':
      return `Project needs an initial commit before task creation: ${error.branch}`;
    case 'branch-create-failed':
      return `Could not create branch "${error.branch}".`;
    case 'pr-fetch-failed':
      return `Could not fetch pull request from remote "${error.remote}".`;
    case 'branch-not-found':
      return `Branch was not found: ${error.branch}`;
    case 'worktree-setup-failed':
      return error.message ?? `Could not set up worktree for branch "${error.branch}".`;
    case 'provision-failed':
      return `Task could not be provisioned: ${error.message}`;
    case 'provision-timeout':
      return `Task setup timed out after ${Math.round(error.timeoutMs / 1000)}s.`;
  }
}

function mapCreateTaskWarning(warning: CreateTaskWarning): string {
  switch (warning.type) {
    case 'branch-publish-failed':
      return `Branch "${warning.branch}" was created but could not be published to "${warning.remote}".`;
    case 'task-naming-failed':
      return warning.blocksProvision
        ? `Task naming failed: ${warning.message}`
        : `Task naming failed; using the initial title: ${warning.message}`;
    case 'branch-setup-failed':
      return `Could not prepare branch "${warning.branch}": ${warning.message}`;
  }
}

function normalizeCreateDemandRequest(body: unknown): MobileCreateDemandRequest {
  if (!body || typeof body !== 'object') {
    throw new MobileGatewayError(400, 'invalid_body', 'Request body must be an object.');
  }

  const value = body as Record<string, unknown>;
  const prompt = typeof value.prompt === 'string' ? value.prompt.trim() : '';
  if (!prompt) {
    throw new MobileGatewayError(400, 'missing_prompt', 'Prompt is required.');
  }

  return {
    prompt,
    projectId: typeof value.projectId === 'string' ? value.projectId.trim() || null : null,
    title: typeof value.title === 'string' ? value.title.trim() || undefined : undefined,
    provider: typeof value.provider === 'string' ? value.provider.trim() || undefined : undefined,
  };
}

function isAgentProviderId(value: string): value is AgentProviderId {
  return AGENT_PROVIDER_IDS.includes(value as AgentProviderId);
}

export class MobileGatewayService {
  private server: http.Server | null = null;
  private token = '';
  private host = '0.0.0.0';
  private port = MOBILE_GATEWAY_DEFAULT_PORT;

  async initialize(): Promise<void> {
    if (!shouldStartGateway()) return;

    this.host = process.env.YODA_MOBILE_GATEWAY_HOST?.trim() || '0.0.0.0';
    this.port = parsePort(process.env.YODA_MOBILE_GATEWAY_PORT);
    this.token = mobileGatewayToken();

    this.server = http.createServer((req, res) => {
      void this.handleRequest(req, res).catch((e: unknown) => {
        if (e instanceof MobileGatewayError) {
          writeError(res, e);
          return;
        }
        log.warn('MobileGateway: request failed', { error: String(e) });
        writeError(
          res,
          new MobileGatewayError(500, 'internal_error', 'Mobile gateway request failed.')
        );
      });
    });

    await new Promise<void>((resolve, reject) => {
      this.server!.listen(this.port, this.host, () => {
        const address = this.server!.address();
        if (address && typeof address === 'object') {
          this.port = address.port;
        }
        resolve();
      });
      this.server!.on('error', reject);
    });

    log.info('MobileGateway: started', {
      host: this.host,
      port: this.port,
      urls: lanUrls(this.port),
      token: process.env.YODA_MOBILE_GATEWAY_TOKEN ? '<env>' : this.token,
    });
  }

  dispose(): void {
    if (!this.server) return;
    this.server.close();
    this.server = null;
  }

  getConnectionInfo(): MobileGatewayConnectionInfo {
    const urls = lanUrls(this.port);
    const primaryUrl = urls[0] ?? `http://localhost:${this.port}`;
    return {
      enabled: shouldStartGateway(),
      running: Boolean(this.server),
      host: this.host,
      port: this.port,
      token: this.token || null,
      urls,
      localExpoUrl: this.token ? localExpoUrl(primaryUrl, this.token) : null,
      installUrl: mobileInstallUrl(),
      pairingUrl:
        this.server && this.token
          ? createMobilePairingUrl({ baseUrl: primaryUrl, token: this.token })
          : null,
    };
  }

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    if (req.method === 'OPTIONS') {
      writeJson(res, 204, {});
      return;
    }

    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    if (req.method === 'GET' && url.pathname === '/health') {
      writeJson(res, 200, {
        ok: true,
        service: 'yoda-mobile-gateway',
        tokenRequired: true,
      });
      return;
    }

    if (!this.isAuthorized(req)) {
      throw new MobileGatewayError(401, 'unauthorized', 'Valid mobile gateway token is required.');
    }

    if (req.method === 'GET' && url.pathname === '/v1/snapshot') {
      writeJson(res, 200, await this.getSnapshot());
      return;
    }

    if (req.method === 'POST' && url.pathname === '/v1/demands') {
      const body = normalizeCreateDemandRequest(await readJsonBody(req));
      writeJson(res, 201, await this.createDemand(body));
      return;
    }

    throw new MobileGatewayError(404, 'not_found', 'Mobile gateway endpoint was not found.');
  }

  private isAuthorized(req: http.IncomingMessage): boolean {
    const authHeader = req.headers.authorization;
    const bearer =
      typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
        ? authHeader.slice('Bearer '.length).trim()
        : '';
    const headerToken = req.headers['x-yoda-mobile-token'];
    return bearer === this.token || headerToken === this.token;
  }

  private async getSnapshot(): Promise<MobileDashboardSnapshot> {
    const [projects, tasks] = await Promise.all([getProjects(), getTasks()]);
    const mappedProjects = projects.map((project) => this.mapProject(project));
    const activeTasks = tasks.filter((task) => !task.archivedAt);
    const mappedTasks = activeTasks.map((task) => this.mapTask(task));

    return {
      generatedAt: new Date().toISOString(),
      projects: mappedProjects,
      tasks: mappedTasks,
      metrics: {
        projectCount: mappedProjects.filter((project) => !project.isInternal).length,
        openProjectCount: mappedProjects.filter((project) => project.isOpen && !project.isInternal)
          .length,
        activeTaskCount: mappedTasks.length,
        inProgressTaskCount: mappedTasks.filter((task) => task.status === 'in_progress').length,
        reviewTaskCount: mappedTasks.filter((task) => task.status === 'review').length,
      },
    };
  }

  private mapProject(project: Project): MobileProjectSummary {
    return {
      id: project.id,
      name: project.name,
      displayName: project.isInternal ? 'Drafts' : projectDisplayName(project),
      type: project.type,
      path: project.path,
      isInternal: project.isInternal,
      isOpen: Boolean(projectManager.getProject(project.id)),
      updatedAt: project.updatedAt,
    };
  }

  private mapTask(task: Task): MobileTaskSummary {
    return {
      id: task.id,
      projectId: task.projectId,
      name: task.name,
      status: task.status,
      bootstrapStatus: taskManager.getBootstrapStatus(task.id),
      taskBranch: task.taskBranch,
      updatedAt: task.updatedAt,
      lastInteractedAt: task.lastInteractedAt,
      needsReview: task.needsReview,
      isPinned: task.isPinned,
      providerCounts: task.conversations,
      conversationCount: Object.values(task.conversations).reduce((sum, count) => sum + count, 0),
    };
  }

  private async createDemand(
    params: MobileCreateDemandRequest
  ): Promise<MobileCreateDemandResponse> {
    const projectId = params.projectId || INTERNAL_PROJECT_ID;
    const project = await this.ensureProjectOpen(projectId);
    const provider = await this.resolveProvider(params.provider);
    const taskId = randomUUID();
    const conversationId = randomUUID();
    const existingTaskNames = (await getTasks(projectId)).map((task) => task.name);
    const generatedName = generateTaskName({ title: params.title || params.prompt });
    const taskName = ensureUniqueTaskSlug(generatedName, existingTaskNames);
    const sourceBranch = await this.resolveSourceBranch(project, projectId);

    const result = await createTask({
      id: taskId,
      projectId,
      name: taskName,
      sourceBranch,
      strategy: { kind: 'no-worktree' },
      initialConversation: {
        id: conversationId,
        projectId,
        taskId,
        provider,
        title: taskNameFromPrompt(params.prompt) || 'Mobile request',
        initialPrompt: params.prompt,
      },
    });

    if (!result.success) {
      throw new MobileGatewayError(422, 'create_task_failed', mapCreateTaskError(result.error));
    }

    return {
      task: this.mapTask(result.data.task),
      warning: result.data.warning ? mapCreateTaskWarning(result.data.warning) : undefined,
    };
  }

  private async ensureProjectOpen(projectId: string): Promise<Project> {
    const project = await getProjectById(projectId);
    if (!project) {
      throw new MobileGatewayError(404, 'project_not_found', 'Project was not found.');
    }
    if (projectManager.getProject(projectId)) return project;

    const result = await openProject(projectId);
    if (!result.success) {
      throw new MobileGatewayError(424, 'project_open_failed', mapOpenProjectError(result.error));
    }
    return project;
  }

  private async resolveProvider(provider: string | undefined): Promise<AgentProviderId> {
    if (provider) {
      if (isAgentProviderId(provider)) return provider;
      throw new MobileGatewayError(400, 'invalid_provider', `Unsupported provider: ${provider}`);
    }
    return appSettingsService.get('defaultAgent');
  }

  private async resolveSourceBranch(project: Project, projectId: string) {
    const provider = projectManager.getProject(projectId);
    const repoInfo = await provider?.repository.getRepositoryInfo().catch(() => null);
    return {
      type: 'local' as const,
      branch: repoInfo?.currentBranch || project.baseRef || 'main',
    };
  }
}

export const mobileGatewayService = new MobileGatewayService();
