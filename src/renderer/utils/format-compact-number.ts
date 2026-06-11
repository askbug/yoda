// Standard compact notation with full magnitude support (K/M/B/T):
// 999 → "999", 4273 → "4.27K", 4_273_000_000 → "4.27B". Unlike the
// integer-only formatDiffLineCount, keeps fraction digits so token totals
// stay readable across magnitudes.
const compactFormatter = new Intl.NumberFormat('en', {
  notation: 'compact',
  maximumFractionDigits: 2,
});

export function formatCompactNumber(value: number): string {
  return compactFormatter.format(value);
}

/**
 * Same formatting split into number and magnitude unit ("4.27" + "B") so the
 * unit can be typeset distinctly from the digits.
 */
export function formatCompactNumberParts(value: number): { value: string; unit: string } {
  let num = '';
  let unit = '';
  for (const part of compactFormatter.formatToParts(value)) {
    if (part.type === 'compact') unit += part.value;
    else num += part.value;
  }
  return { value: num, unit };
}
