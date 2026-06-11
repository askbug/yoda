import { RUNTIME_IDS, type RuntimeId } from './runtime-registry';

const CONV_SEP = '-conv-';

// Legacy separators — used only for snapshot migration fallback lookups.
const LEGACY_MAIN_SEP = '-main-';
const LEGACY_CHAT_SEP = '-chat-';

export function makePtyId(provider: RuntimeId | 'shell', conversationId: string): string {
  return `${provider}${CONV_SEP}${conversationId}`;
}

export function parsePtyId(id: string): {
  runtimeId: RuntimeId | 'shell';
  conversationId: string;
} | null {
  // Try 'shell' sentinel first, then all known provider IDs longest-first to avoid prefix collisions.
  const candidates: Array<RuntimeId | 'shell'> = [
    'shell',
    ...[...RUNTIME_IDS].sort((a, b) => b.length - a.length),
  ];
  for (const pid of candidates) {
    const prefix = pid + CONV_SEP;
    if (id.startsWith(prefix)) {
      return { runtimeId: pid, conversationId: id.slice(prefix.length) };
    }
  }
  return null;
}

/**
 * Try to parse a legacy PTY ID (pre-refactor format: {prov}-main-{taskId} or {prov}-chat-{convId}).
 * Used only by TerminalSnapshotService for one-time fallback lookups on existing snapshots.
 */
export function parseLegacyPtyId(id: string): {
  runtimeId: RuntimeId;
  kind: 'main' | 'chat';
  suffix: string;
} | null {
  const sorted = [...RUNTIME_IDS].sort((a, b) => b.length - a.length);
  for (const pid of sorted) {
    if (id.startsWith(pid + LEGACY_MAIN_SEP)) {
      return {
        runtimeId: pid,
        kind: 'main',
        suffix: id.slice(pid.length + LEGACY_MAIN_SEP.length),
      };
    }
    if (id.startsWith(pid + LEGACY_CHAT_SEP)) {
      return {
        runtimeId: pid,
        kind: 'chat',
        suffix: id.slice(pid.length + LEGACY_CHAT_SEP.length),
      };
    }
  }
  return null;
}
