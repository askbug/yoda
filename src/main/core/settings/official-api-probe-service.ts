import { net } from 'electron';
import {
  getRuntimeAccountProfile,
  type AgentApiProbeResult,
  type RuntimeId,
} from '@shared/runtime-registry';
import { log } from '@main/lib/logger';
import { runtimeOverrideSettings } from './runtime-settings-service';

const PROBE_TIMEOUT_MS = 10_000;

/**
 * Makes a real authenticated request against the provider's registered probe
 * endpoint, resolving the key and base URL the same way session launches do:
 * Yoda's custom env first, then the inherited process env. Uses Electron's
 * network stack so system proxy settings apply.
 */
export async function probeOfficialApi(id: RuntimeId): Promise<AgentApiProbeResult> {
  const base: AgentApiProbeResult = {
    runtimeId: id,
    supported: false,
    ok: false,
    status: null,
    endpoint: null,
    error: null,
    checkedAt: new Date().toISOString(),
  };
  const spec = getRuntimeAccountProfile(id).officialApi.probe;
  if (!spec) return base;

  const config = await runtimeOverrideSettings.getItem(id);
  const customEnv = config?.env ?? {};
  const resolve = (key: string): string | null =>
    customEnv[key]?.trim() || process.env[key]?.trim() || null;

  const apiKey = spec.authEnvVars.map(resolve).find(Boolean) ?? null;
  if (!apiKey) {
    return { ...base, supported: true, error: 'API key is not configured.' };
  }

  const baseUrl = (spec.baseUrlEnvVar && resolve(spec.baseUrlEnvVar)) || spec.defaultBaseUrl;
  const endpoint = `${baseUrl.replace(/\/+$/, '')}${spec.path}`;
  const headers: Record<string, string> = { ...spec.headers };
  if (spec.auth === 'bearer') headers.Authorization = `Bearer ${apiKey}`;
  else if (spec.auth === 'x-api-key') headers['x-api-key'] = apiKey;
  else headers['x-goog-api-key'] = apiKey;

  try {
    const response = await net.fetch(endpoint, {
      headers,
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    if (response.ok) {
      return { ...base, supported: true, ok: true, status: response.status, endpoint };
    }
    const error =
      response.status === 401 || response.status === 403
        ? `Authentication failed (${response.status}) — the API key was rejected.`
        : `Endpoint returned ${response.status} ${response.statusText || ''}`.trim();
    return { ...base, supported: true, status: response.status, endpoint, error };
  } catch (error) {
    log.warn(`Official API probe failed for ${id}:`, error);
    const message =
      error instanceof Error && error.name === 'TimeoutError'
        ? `Request timed out after ${PROBE_TIMEOUT_MS / 1000}s.`
        : error instanceof Error
          ? error.message
          : 'Request failed.';
    return { ...base, supported: true, endpoint, error: message };
  }
}
