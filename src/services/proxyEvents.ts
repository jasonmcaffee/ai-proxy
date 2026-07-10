import type { Response } from 'express';
import type { CompressionMeta, CompressionProgress } from './contextCompressor.service';

/**
 * Proxy-extension event envelope streamed alongside OpenAI chunks. It carries no `choices`,
 * so an OpenAI SDK consumer that doesn't understand it simply ignores it.
 */
export type ProxyEvent =
  | { object: 'ai_proxy.event'; type: 'compression_progress'; data: CompressionProgress }
  | { object: 'ai_proxy.event'; type: 'context_usage'; data: CompressionMeta };

/**
 * Serializes a compression-progress event as an SSE data frame.
 * @param p - compression progress payload
 */
export function compressionProgressFrame(p: CompressionProgress): string {
  const evt: ProxyEvent = { object: 'ai_proxy.event', type: 'compression_progress', data: p };
  return `data: ${JSON.stringify(evt)}\n\n`;
}

/**
 * Serializes a context-usage event as an SSE data frame.
 * @param meta - compression/context-usage metadata
 */
export function contextUsageFrame(meta: CompressionMeta): string {
  const evt: ProxyEvent = { object: 'ai_proxy.event', type: 'context_usage', data: meta };
  return `data: ${JSON.stringify(evt)}\n\n`;
}

/**
 * Sets context-usage response headers (works for streaming and non-streaming responses when headers are not yet sent).
 * @param res - express response
 * @param meta - compression/context-usage metadata
 */
export function setContextUsageHeaders(res: Response, meta: CompressionMeta): void {
  if (res.headersSent) return;
  res.setHeader('x-ai-proxy-context-tokens', String(meta.inputTokens));
  res.setHeader('x-ai-proxy-context-limit', String(meta.contextLimit));
  res.setHeader('x-ai-proxy-context-used-pct', String(meta.usedPct));
  if (meta.compressAtTokens != null) res.setHeader('x-ai-proxy-compress-at', String(meta.compressAtTokens));
  res.setHeader('x-ai-proxy-compressed', String(meta.compressed));
  if (meta.strategy) res.setHeader('x-ai-proxy-strategy', meta.strategy);
}
