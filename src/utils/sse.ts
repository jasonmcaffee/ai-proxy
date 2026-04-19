/**
 * Parses a raw SSE line into the data payload string, or null if not a data line.
 * @param line - raw SSE text line
 */
export function parseSseLine(line: string): string | null {
  if (!line.startsWith('data: ')) return null;
  return line.slice('data: '.length).trim();
}

/**
 * Encodes a data payload into a SSE line with trailing newlines.
 * @param data - the payload string to wrap
 */
export function encodeSseLine(data: string): string {
  return `data: ${data}\n\n`;
}

/**
 * Safely parses JSON from an SSE data payload.
 * Returns null on parse failure rather than throwing.
 * @param data - JSON string from SSE data field
 */
export function parseSseJson<T = unknown>(data: string): T | null {
  try {
    return JSON.parse(data) as T;
  } catch {
    return null;
  }
}
