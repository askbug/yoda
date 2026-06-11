import { describe, expect, it } from 'vitest';
import { normalizeConversationTranscript } from './transcript-normalization';

describe('normalizeConversationTranscript', () => {
  it('keeps valid transcript payloads', () => {
    expect(
      normalizeConversationTranscript({
        filePath: '/tmp/session.jsonl',
        totalLines: 12,
        lines: ['{"type":"user"}', '{"type":"assistant"}'],
      })
    ).toEqual({
      filePath: '/tmp/session.jsonl',
      totalLines: 12,
      lines: ['{"type":"user"}', '{"type":"assistant"}'],
    });
  });

  it('fills missing lines with an empty array', () => {
    expect(
      normalizeConversationTranscript({
        filePath: '/tmp/session.jsonl',
        totalLines: 12,
      })
    ).toEqual({
      filePath: '/tmp/session.jsonl',
      totalLines: 12,
      lines: [],
    });
  });

  it('filters malformed lines and keeps total lines non-decreasing', () => {
    expect(
      normalizeConversationTranscript({
        filePath: 42,
        totalLines: 1,
        lines: ['a', null, 'b'],
      })
    ).toEqual({
      filePath: null,
      totalLines: 2,
      lines: ['a', 'b'],
    });
  });

  it('returns an empty transcript for non-object payloads', () => {
    expect(normalizeConversationTranscript(undefined)).toEqual({
      filePath: null,
      totalLines: 0,
      lines: [],
    });
  });
});
