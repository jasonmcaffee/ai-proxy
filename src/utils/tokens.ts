const CHARS_PER_TOKEN = 4;
const MESSAGE_OVERHEAD = 4;

/**
 * Estimates token count for a string or object using character-based heuristic.
 * @param text - string or object to estimate
 */
export function estimateTokens(text: string | object): number {
  const str = typeof text === 'string' ? text : JSON.stringify(text);
  return Math.ceil(str.length / CHARS_PER_TOKEN) + MESSAGE_OVERHEAD;
}

/**
 * Estimates token count for raw string content without per-message overhead.
 * @param text - raw string content
 */
export function estimateContentTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}
