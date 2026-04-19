/** Proxy-specific extensions beyond the OpenAI standard request shape */
export type ProxyExtensions = {
  disableThinking?: boolean;
  compressionOptions?: { enabled?: boolean; maxContextSize?: number };
  awaitToolCallCompletion?: boolean;
};
