/** Max tool-call rounds per user message when maxInteractions is unlimited (-1). */
export const MAX_TOOL_ITERATIONS = 20;

/** When prompt_tokens reaches this value, conversation history is auto-compacted. */
export const AUTO_COMPACT_TOKEN_THRESHOLD = 1_000_000;

/**
 * When compacting, the last N tokens of raw conversation history are kept intact
 * to preserve workflow continuity (recent tool call chains, AI reasoning, etc.).
 * Only history before this window is compressed into a summary and archived.
 * 20k tokens ≈ 5-10 rounds of user ↔ AI ↔ tool interaction.
 */
export const COMPACT_RESERVE_TOKENS = 20_000;
