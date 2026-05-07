/**
 * Normalizes text for fuzzy comparison: lowercases and collapses punctuation/whitespace.
 * @param text - raw text
 */
export function normalizeText(text: string): string {
  return text.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * Returns the fraction of expected words found in the actual text (0–1).
 * @param actual - normalized actual text
 * @param expected - normalized expected text
 */
export function wordOverlap(actual: string, expected: string): number {
  const expectedWords = expected.split(' ').filter(Boolean);
  const actualWords = new Set(actual.split(' ').filter(Boolean));
  const found = expectedWords.filter(w => actualWords.has(w)).length;
  return found / expectedWords.length;
}
