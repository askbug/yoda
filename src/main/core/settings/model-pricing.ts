/**
 * Bundled model pricing snapshot (USD per million tokens), following
 * ccusage's approach: longest-prefix match against the model id, never
 * guess a price for unknown models. Source: LiteLLM
 * model_prices_and_context_window.json, verified 2026-06-10.
 */
export type ModelPricing = {
  input: number;
  output: number;
  /** 5-minute prompt-cache write. */
  cacheWrite5m?: number;
  /** 1-hour prompt-cache write (Anthropic prices this at 2x input). */
  cacheWrite1h?: number;
  /** Cache read (Anthropic) / cached input (OpenAI). */
  cacheRead?: number;
};

// Ordered longest/most-specific prefix first; first match wins.
const PRICING_BY_PREFIX: [string, ModelPricing][] = [
  // Anthropic — legacy Opus 4.0 / 4.1 (date-suffixed ids like claude-opus-4-20250514)
  [
    'claude-opus-4-1',
    { input: 15, output: 75, cacheWrite5m: 18.75, cacheWrite1h: 30, cacheRead: 1.5 },
  ],
  [
    'claude-opus-4-2',
    { input: 15, output: 75, cacheWrite5m: 18.75, cacheWrite1h: 30, cacheRead: 1.5 },
  ],
  // Anthropic — Opus 4.5+ repriced family
  ['claude-opus-4', { input: 5, output: 25, cacheWrite5m: 6.25, cacheWrite1h: 10, cacheRead: 0.5 }],
  [
    'claude-sonnet-4',
    { input: 3, output: 15, cacheWrite5m: 3.75, cacheWrite1h: 6, cacheRead: 0.3 },
  ],
  ['claude-haiku-4', { input: 1, output: 5, cacheWrite5m: 1.25, cacheWrite1h: 2, cacheRead: 0.1 }],
  // OpenAI — GPT-5 family (cacheRead = cached-input price)
  ['gpt-5.5', { input: 5, output: 30, cacheRead: 0.5 }],
  ['gpt-5.4', { input: 2.5, output: 15, cacheRead: 0.25 }],
  ['gpt-5.3', { input: 1.75, output: 14, cacheRead: 0.175 }],
  ['gpt-5.2', { input: 1.75, output: 14, cacheRead: 0.175 }],
  ['gpt-5.1', { input: 1.25, output: 10, cacheRead: 0.125 }],
  ['gpt-5', { input: 1.25, output: 10, cacheRead: 0.125 }],
];

export function getModelPricing(model: string): ModelPricing | null {
  const normalized = model.trim().toLowerCase().replace(/^.*\//, '');
  if (!normalized) return null;
  const match = PRICING_BY_PREFIX.find(([prefix]) => normalized.startsWith(prefix));
  return match ? match[1] : null;
}
