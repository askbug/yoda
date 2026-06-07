import type { MaasPlatformConnection, MaasPlatformId } from '@shared/maas';
import { log } from '@main/lib/logger';

const SECRET_PREFIX = 'yoda-maas-token';

export type OpenAiCompatibleChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type OpenAiCompatibleChatInput = {
  model?: string;
  messages: OpenAiCompatibleChatMessage[];
  maxTokens: number;
  temperature: number;
  timeoutMs: number;
};

export type OpenAiCompatibleChatResult = {
  content: string;
  model: string;
  platformId: MaasPlatformId;
  durationMs: number;
};

type ChatCompletionResponse = {
  choices?: Array<{ message?: { content?: string } }>;
};

export async function requestOpenAiCompatibleChat(
  input: OpenAiCompatibleChatInput
): Promise<OpenAiCompatibleChatResult | undefined> {
  const connection = await loadActiveConnection();
  if (!connection) return undefined;

  const { encryptedAppSecretsStore } = await import(
    '@main/core/secrets/encrypted-app-secrets-store'
  );
  const apiKey = await encryptedAppSecretsStore.getSecret(secretKey(connection.platformId));
  if (!apiKey) return undefined;

  const model = input.model?.trim() || (await inferModel(connection.platformId));
  if (!model) return undefined;

  const url = `${trimTrailingSlash(connection.endpoint)}/chat/completions`;
  const controller = new AbortController();
  const startedAt = Date.now();
  const timer = setTimeout(() => controller.abort(), input.timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        max_tokens: input.maxTokens,
        temperature: input.temperature,
        messages: input.messages,
      }),
    });
    if (!response.ok) {
      log.warn('openai-compatible-chat: HTTP error', {
        platformId: connection.platformId,
        status: response.status,
      });
      return undefined;
    }

    const body = (await response.json()) as ChatCompletionResponse;
    const content = body.choices?.[0]?.message?.content?.trim();
    if (!content) return undefined;

    return {
      content,
      model,
      platformId: connection.platformId,
      durationMs: Date.now() - startedAt,
    };
  } catch (error) {
    log.warn('openai-compatible-chat: request failed', { error: String(error) });
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

export async function hasOpenAiCompatibleChatConnection(): Promise<boolean> {
  const connection = await loadActiveConnection();
  if (!connection) return false;

  const { encryptedAppSecretsStore } = await import(
    '@main/core/secrets/encrypted-app-secrets-store'
  );
  const apiKey = await encryptedAppSecretsStore.getSecret(secretKey(connection.platformId));
  return Boolean(apiKey);
}

async function loadActiveConnection(): Promise<MaasPlatformConnection | undefined> {
  const { appSettingsService } = await import('@main/core/settings/settings-service');
  const settings = await appSettingsService.get('maas');
  const selectedId = settings.selectedPlatformId;
  if (!selectedId) return undefined;
  return settings.connections.find((connection) => connection.platformId === selectedId);
}

async function inferModel(platformId: MaasPlatformId): Promise<string | undefined> {
  try {
    if (platformId === 'zenmux') {
      const { maasService } = await import('./maas-service');
      return (
        (await maasService.listTextModelCandidates())[0] ??
        (await maasService.listZenmuxCatalogTextModelCandidates())[0]
      );
    }
    return undefined;
  } catch (error) {
    log.warn('openai-compatible-chat: model inference failed', { error: String(error) });
    return undefined;
  }
}

function secretKey(platformId: MaasPlatformId): string {
  return `${SECRET_PREFIX}:${platformId}`;
}

function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}
