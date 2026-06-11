import { and, eq } from 'drizzle-orm';
import type {
  Conversation,
  ConversationNamingSnapshot,
  SessionTranscriptMessage,
} from '@shared/conversations';
import { conversationNamingUpdatedChannel } from '@shared/events/conversationEvents';
import type { RuntimeId } from '@shared/runtime-registry';
import { normalizeTaskDisplayName } from '@shared/task-name';
import type {
  TaskNamingContextSnapshot,
  TaskNamingDebugStage,
  TaskNamingSettings,
  TaskNamingStatus,
} from '@shared/task-naming';
import { projectManager } from '@main/core/projects/project-manager';
import type { ProjectProvider } from '@main/core/projects/project-provider';
import {
  buildCommonProjectNamingSources,
  buildDebugTrace,
  buildNamingPromptParts,
  createNamingContextSnapshot,
  requestAgentNamingPayload,
  resolveNamingRuntime,
  type AgentNamingRuntime,
  type NamingContextSourceDraft,
} from '@main/core/tasks/name-generation/task-naming-service';
import { db } from '@main/db/client';
import { conversations, projects } from '@main/db/schema';
import { events } from '@main/lib/events';
import { log } from '@main/lib/logger';
import { getClaudeSessionContext } from './getClaudeSessionContext';
import { getCodexSessionContext } from './getCodexSessionContext';
import { mapConversationRowToConversation } from './utils';

const MAX_TRANSCRIPT_CHARS = 6_000;
const MAX_MESSAGE_CHARS = 1_200;
const MAX_CONTEXT_MESSAGES = 12;
const MAX_SESSION_TITLE_CHARS = 48;

const conversationNamingSnapshots = new Map<string, ConversationNamingSnapshot>();

export type GenerateConversationTitleResult = {
  title: string;
  runtimeId: RuntimeId;
  runtimeName: string;
  model: string;
  messageCount: number;
  promptChars: number;
  snapshot: ConversationNamingSnapshot;
};

type ConversationNamingDraft = {
  conversation: Conversation;
  workingDirectory: string;
  messages: SessionTranscriptMessage[];
  settings: TaskNamingSettings;
  runtimeId: RuntimeId;
  runtimeName: string;
  runtime: AgentNamingRuntime;
  model: string;
  context: TaskNamingContextSnapshot;
  systemPrompt: string;
  systemPromptEstimatedTokens: number;
  prompt: string;
  promptEstimatedTokens: number;
  promptBuildDurationMs: number;
};

export async function generateConversationTitle(
  projectId: string,
  taskId: string,
  conversationId: string,
  cwd?: string
): Promise<GenerateConversationTitleResult> {
  const startedAt = Date.now();
  const stages: TaskNamingDebugStage[] = [];
  const recordStage = (
    name: string,
    durationMs: number,
    metadata?: TaskNamingDebugStage['metadata']
  ) => {
    stages.push({ name, durationMs, metadata });
  };

  const { conversation, workingDirectory } = await loadConversationForNaming(
    projectId,
    taskId,
    conversationId,
    cwd
  );
  let context: TaskNamingContextSnapshot | null = null;
  let runtimeId: RuntimeId | null = null;
  let runtimeName: string | null = null;
  let model: string | null = null;
  let systemPrompt: string | undefined;
  let systemPromptEstimatedTokens: number | undefined;
  let prompt: string | undefined;
  let promptEstimatedTokens: number | undefined;

  try {
    const draftStartedAt = Date.now();
    const draft = await buildConversationNamingDraft(projectId, taskId, conversationId, cwd);
    const {
      messages,
      settings,
      runtime,
      context: draftContext,
      prompt: draftPrompt,
      promptBuildDurationMs,
      promptEstimatedTokens: draftPromptEstimatedTokens,
      systemPrompt: draftSystemPrompt,
      systemPromptEstimatedTokens: draftSystemPromptEstimatedTokens,
    } = draft;
    runtimeId = draft.runtimeId;
    runtimeName = draft.runtimeName;
    model = draft.model;
    context = draftContext;
    systemPrompt = draftSystemPrompt;
    systemPromptEstimatedTokens = draftSystemPromptEstimatedTokens;
    prompt = draftPrompt;
    promptEstimatedTokens = draftPromptEstimatedTokens;
    recordStage('prepareDraft', Date.now() - draftStartedAt, {
      messageCount: messages.length,
      runtimeId: conversation.runtimeId,
      sourceCount: context.sourceCount,
      estimatedTokens: context.estimatedTokens,
      estimatedCharacters: context.estimatedCharacters,
      namingModelConfigured: Boolean(model),
      timeoutMs: settings.requestTimeoutMs,
      hasProviderConfig: true,
      hasNamingCommand: Boolean(runtime.providerConfig.namingCommand?.trim()),
    });
    if (messages.length === 0) {
      throw new Error('No session transcript is available for Agent-based renaming.');
    }

    saveConversationNamingSnapshot({
      conversation,
      status: 'generating',
      model,
      runtimeId,
      runtimeName,
      context,
      systemPrompt,
      systemPromptEstimatedTokens,
      prompt,
      promptEstimatedTokens,
    });

    const requestStartedAt = Date.now();
    const result = await requestAgentNamingPayload({
      context,
      prompt,
      promptBuildDurationMs,
      includeBranchName: false,
      settings,
      runtime,
      cwd: workingDirectory,
    });
    recordStage('agentCliRequest', Date.now() - requestStartedAt, {
      method: result.method,
      model: result.model || null,
    });

    const title = normalizeGeneratedConversationTitle(
      result.payload.sessionTitle ?? result.payload.title ?? result.payload.taskName
    );
    if (!title) throw new Error('Model did not return a usable session title.');

    const snapshot = saveConversationNamingSnapshot({
      conversation,
      status: 'ready',
      model: result.model || model,
      runtimeId,
      runtimeName,
      context: {
        ...context,
        model: result.model || context.model,
        generationMethod: result.method,
        debugTrace: buildDebugTrace(startedAt, [...stages, ...result.stages]),
      },
      systemPrompt,
      systemPromptEstimatedTokens,
      prompt,
      promptEstimatedTokens,
      generatedTitle: title,
    });

    return {
      title,
      runtimeId,
      runtimeName,
      model: result.model || model,
      messageCount: messages.length,
      promptChars: prompt.length,
      snapshot,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.warn('generateConversationTitle: failed', {
      conversationId,
      projectId,
      taskId,
      error: message,
    });
    saveConversationNamingSnapshot({
      conversation,
      status: 'failed',
      model,
      runtimeId,
      runtimeName,
      context: context ? { ...context, debugTrace: buildDebugTrace(startedAt, stages) } : null,
      systemPrompt,
      systemPromptEstimatedTokens,
      prompt,
      promptEstimatedTokens,
      error: message,
    });
    throw error;
  }
}

export async function getConversationNamingPreview(
  projectId: string,
  taskId: string,
  conversationId: string,
  cwd?: string
): Promise<ConversationNamingSnapshot> {
  try {
    const draft = await buildConversationNamingDraft(projectId, taskId, conversationId, cwd);
    return createConversationNamingSnapshot({
      conversation: draft.conversation,
      status: 'idle',
      model: draft.model,
      runtimeId: draft.runtimeId,
      runtimeName: draft.runtimeName,
      context: draft.context,
      systemPrompt: draft.systemPrompt,
      systemPromptEstimatedTokens: draft.systemPromptEstimatedTokens,
      prompt: draft.prompt,
      promptEstimatedTokens: draft.promptEstimatedTokens,
    });
  } catch (error) {
    const { conversation } = await loadConversationForNaming(
      projectId,
      taskId,
      conversationId,
      cwd
    );
    return createConversationNamingSnapshot({
      conversation,
      status: 'failed',
      model: null,
      runtimeId: null,
      runtimeName: null,
      context: null,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function getConversationNamingSnapshot(
  projectId: string,
  taskId: string,
  conversationId: string
): Promise<ConversationNamingSnapshot | null> {
  const snapshot = conversationNamingSnapshots.get(conversationId);
  if (!snapshot || snapshot.projectId !== projectId || snapshot.taskId !== taskId) return null;
  return snapshot;
}

async function buildConversationNamingDraft(
  projectId: string,
  taskId: string,
  conversationId: string,
  cwd?: string
): Promise<ConversationNamingDraft> {
  const { conversation, projectName, workingDirectory } = await loadConversationForNaming(
    projectId,
    taskId,
    conversationId,
    cwd
  );
  const messages = await loadSessionMessages(conversation, workingDirectory);
  const namingRuntime = await resolveNamingRuntime(conversation.runtimeId);
  const { settings, runtimeId, runtimeName, runtime } = namingRuntime;
  if (!runtime) {
    throw new Error(`No provider configuration is available for ${runtimeName}.`);
  }
  const context = await buildConversationNamingContextSnapshot({
    conversation,
    project: projectManager.getProject(projectId) ?? null,
    projectName,
    projectPath: workingDirectory,
    messages,
    settings,
  });
  const promptStartedAt = Date.now();
  const promptParts = buildNamingPromptParts({
    target: 'session',
    context,
    customSystemPrompt: namingRuntime.customSystemPrompt,
  });
  const promptBuildDurationMs = Date.now() - promptStartedAt;

  return {
    conversation,
    workingDirectory,
    messages,
    settings,
    runtimeId,
    runtimeName,
    runtime,
    model: settings.model,
    context,
    systemPrompt: promptParts.systemPrompt,
    systemPromptEstimatedTokens: promptParts.systemPromptEstimatedTokens,
    prompt: promptParts.prompt,
    promptEstimatedTokens: promptParts.promptEstimatedTokens,
    promptBuildDurationMs,
  };
}

async function loadConversationForNaming(
  projectId: string,
  taskId: string,
  conversationId: string,
  cwd?: string
): Promise<{
  conversation: Conversation;
  projectName: string;
  workingDirectory: string;
}> {
  const [row] = await db
    .select({ conversation: conversations, projectName: projects.name, projectPath: projects.path })
    .from(conversations)
    .innerJoin(projects, eq(conversations.projectId, projects.id))
    .where(
      and(
        eq(conversations.id, conversationId),
        eq(conversations.projectId, projectId),
        eq(conversations.taskId, taskId)
      )
    )
    .limit(1);

  if (!row) throw new Error(`Conversation not found: ${conversationId}`);

  return {
    conversation: mapConversationRowToConversation(row.conversation, true),
    projectName: row.projectName ?? projectId,
    workingDirectory: cwd?.trim() || row.projectPath,
  };
}

async function loadSessionMessages(
  conversation: Conversation,
  cwd: string
): Promise<SessionTranscriptMessage[]> {
  if (conversation.runtimeId === 'claude') {
    const context = await getClaudeSessionContext(cwd, conversation.id);
    return context?.messages ?? promptsToMessages(context?.prompts ?? []);
  }
  if (conversation.runtimeId === 'codex') {
    const context = await getCodexSessionContext(
      cwd,
      conversation.id,
      conversation.title,
      conversation.createdAt ?? null
    );
    return context?.messages ?? promptsToMessages(context?.prompts ?? []);
  }
  return [];
}

function promptsToMessages(
  prompts: Array<{ id: string; text: string; timestamp: string | null }>
): SessionTranscriptMessage[] {
  return prompts.map((prompt) => ({ ...prompt, role: 'user' }));
}

async function buildConversationNamingContextSnapshot(input: {
  conversation: Conversation;
  project: ProjectProvider | null;
  projectName: string;
  projectPath: string;
  messages: SessionTranscriptMessage[];
  settings: TaskNamingSettings;
}): Promise<TaskNamingContextSnapshot> {
  const sources: NamingContextSourceDraft[] = [];

  if (input.settings.context.prompt) {
    sources.push({
      id: 'prompt',
      label: 'Session transcript',
      content: [
        `Current title: ${input.conversation.title}`,
        `Provider: ${input.conversation.runtimeId}`,
        `Conversation ID: ${input.conversation.id}`,
        '',
        formatTranscript(input.messages),
      ].join('\n'),
    });
  }

  sources.push(
    ...(await buildCommonProjectNamingSources({
      projectId: input.conversation.projectId,
      project: input.project,
      projectName: input.projectName,
      projectPath: input.projectPath,
      settings: input.settings,
      excludeTaskId: input.conversation.taskId,
    }))
  );

  return createNamingContextSnapshot({
    taskId: input.conversation.taskId,
    projectId: input.conversation.projectId,
    settings: input.settings,
    sources,
  });
}

function formatTranscript(messages: SessionTranscriptMessage[]): string {
  return clip(
    messages
      .slice(-MAX_CONTEXT_MESSAGES)
      .map((message, index) => {
        const text = clip(message.text.trim(), MAX_MESSAGE_CHARS);
        return `${index + 1}. ${message.role.toUpperCase()}: ${text}`;
      })
      .join('\n\n'),
    MAX_TRANSCRIPT_CHARS
  );
}

function normalizeGeneratedConversationTitle(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const stripped = value.replace(/[\r\n]+/g, ' ').replace(/^["'“”‘’`]+|["'“”‘’`。.!?！？]+$/g, '');
  const normalized = normalizeTaskDisplayName(stripped);
  return normalized ? normalized.slice(0, MAX_SESSION_TITLE_CHARS) : undefined;
}

type ConversationNamingSnapshotInput = {
  conversation: Conversation;
  status: TaskNamingStatus;
  model: string | null;
  runtimeId: RuntimeId | null;
  runtimeName: string | null;
  context: TaskNamingContextSnapshot | null;
  systemPrompt?: string;
  systemPromptEstimatedTokens?: number;
  prompt?: string;
  promptEstimatedTokens?: number;
  generatedTitle?: string;
  error?: string;
};

function createConversationNamingSnapshot(
  input: ConversationNamingSnapshotInput
): ConversationNamingSnapshot {
  const now = new Date().toISOString();
  const existing = conversationNamingSnapshots.get(input.conversation.id);
  const createdAt = input.status === 'generating' ? now : (existing?.createdAt ?? now);
  return {
    conversationId: input.conversation.id,
    projectId: input.conversation.projectId,
    taskId: input.conversation.taskId,
    status: input.status,
    model: input.model,
    runtimeId: input.runtimeId,
    runtimeName: input.runtimeName,
    context: input.context,
    systemPrompt: input.systemPrompt,
    systemPromptEstimatedTokens: input.systemPromptEstimatedTokens,
    prompt: input.prompt,
    promptChars: input.prompt?.length,
    promptEstimatedTokens: input.promptEstimatedTokens,
    generatedTitle: input.generatedTitle,
    error: input.error,
    createdAt,
    updatedAt: now,
  };
}

function saveConversationNamingSnapshot(
  input: ConversationNamingSnapshotInput
): ConversationNamingSnapshot {
  const snapshot = createConversationNamingSnapshot(input);
  conversationNamingSnapshots.set(input.conversation.id, snapshot);
  events.emit(conversationNamingUpdatedChannel, snapshot);
  return snapshot;
}

function clip(value: string, max: number): string {
  return value.length <= max ? value : value.slice(0, max);
}
