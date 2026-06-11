import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TASK_NAMING_TIMEOUT_MS,
  MAX_TASK_NAMING_TIMEOUT_MS,
  MIN_TASK_NAMING_TIMEOUT_MS,
  normalizeTaskNamingTimeoutMs,
} from './task-naming';

describe('normalizeTaskNamingTimeoutMs', () => {
  it('keeps task naming above the stale 15s timeout', () => {
    expect(DEFAULT_TASK_NAMING_TIMEOUT_MS).toBe(60_000);
    expect(MIN_TASK_NAMING_TIMEOUT_MS).toBe(30_000);
  });

  it('uses the default for missing or invalid values', () => {
    expect(normalizeTaskNamingTimeoutMs(undefined)).toBe(DEFAULT_TASK_NAMING_TIMEOUT_MS);
    expect(normalizeTaskNamingTimeoutMs(null)).toBe(DEFAULT_TASK_NAMING_TIMEOUT_MS);
    expect(normalizeTaskNamingTimeoutMs(Number.NaN)).toBe(DEFAULT_TASK_NAMING_TIMEOUT_MS);
  });

  it('clamps stale short timeouts and oversized values', () => {
    expect(normalizeTaskNamingTimeoutMs(15_000)).toBe(MIN_TASK_NAMING_TIMEOUT_MS);
    expect(normalizeTaskNamingTimeoutMs(MAX_TASK_NAMING_TIMEOUT_MS + 1_000)).toBe(
      MAX_TASK_NAMING_TIMEOUT_MS
    );
  });
});
