import type { ChatMessage, ToolCall, ApiConfig } from '../types';
import { COMPACT_RESERVE_TOKENS } from '../constants';
import { SYSTEM_PROMPT } from '../systemPrompt';
import { TOOL_DEFINITIONS } from '../toolDefinitions';
import { sendChatMessage } from '../api';
import { buildLanguageInstruction, getStaticHostEnvironmentBlock } from '../agentRuntimeContext';
import { sanitizeMessageList } from './messageSanitizer';

/** Context needed by the history compactor. */
export interface CompactorContext {
  getLlmMessages(): ChatMessage[];
  setLlmMessages(msgs: ChatMessage[]): void;
  getApiConfig(): ApiConfig;
  getUsageSnapshots(): Array<{ msgCount: number; totalPromptTokens: number }>;
  resetUsageSnapshots(): void;
}

/**
 * Find where to start the reserve window using actual API prompt_tokens.
 * Scans snapshots from the end: the difference between consecutive snapshots'
 * totalPromptTokens reveals how many tokens the messages between them consumed.
 * Returns 0 when no compaction is needed (all messages fit within the reserve window).
 */
export function findReserveWindowStart(
  messages: ChatMessage[],
  snapshots: Array<{ msgCount: number; totalPromptTokens: number }>,
): number {
  if (snapshots.length === 0) return 0;

  const last = snapshots[snapshots.length - 1];
  for (let i = snapshots.length - 2; i >= 0; i--) {
    const diff = last.totalPromptTokens - snapshots[i].totalPromptTokens;
    if (diff >= COMPACT_RESERVE_TOKENS) {
      return snapshots[i + 1].msgCount;
    }
  }
  return 0;
}

/**
 * Adjust the reserve boundary so that assistant(tool_calls) + tool result blocks
 * are never split across the compress/keep boundary.
 *
 * Two cases handled:
 *   A) First kept message is a 'tool' → its assistant is in the compress zone.
 *      Move the boundary backward to include the assistant.
 *   B) Last compressed message is an 'assistant' with tool_calls → its tool
 *      results are in the keep zone. Move the boundary forward to include them.
 */
export function adjustReserveBoundary(messages: ChatMessage[], reserveStart: number): number {
  if (reserveStart <= 0 || reserveStart >= messages.length) return reserveStart;

  // Case A: first kept message is a 'tool' — find its parent assistant in compress zone
  if (messages[reserveStart].role === 'tool') {
    let i = reserveStart - 1;
    while (i >= 0 && (messages[i].role === 'tool' || messages[i].hiddenFromLlm || messages[i].role === 'event')) {
      i--;
    }
    if (i >= 0 && messages[i].role === 'assistant' && messages[i].tool_calls) {
      return i;
    }
    return reserveStart;
  }

  // Case B: last compressed message is an 'assistant' with tool_calls
  // and its tool results are the first messages in the keep zone
  const lastCompressed = messages[reserveStart - 1];
  if (lastCompressed.role === 'assistant' && lastCompressed.tool_calls && lastCompressed.tool_calls.length > 0) {
    const requiredIds = new Set(lastCompressed.tool_calls.map((tc: ToolCall) => tc.id));
    let j = reserveStart;
    const respondedIds = new Set<string>();
    while (j < messages.length && messages[j].role === 'tool') {
      if (messages[j].tool_call_id) {
        respondedIds.add(messages[j].tool_call_id!);
      }
      j++;
    }
    if (Array.from(requiredIds).some(id => respondedIds.has(id))) {
      return j;
    }
  }

  return reserveStart;
}

/**
 * Compact conversation history: older messages (outside the 20k-token reserve window)
 * are sent to the **same main LLM** (same system prompt + original message format)
 * along with a compact instruction, maximizing KV cache hit.
 * Recent messages are preserved intact. Frontend is NOT updated.
 */
export async function compactHistoryFn(
  ctx: CompactorContext,
  triggeredByTokenLimit = false,
): Promise<string> {
  const messages = ctx.getLlmMessages();
  if (messages.length === 0) {
    return JSON.stringify({ success: false, message: 'Nothing to compact: conversation is empty.' });
  }

  // ── Find reserve window ──────────────────────────────────────────────
  const rawReserveStart = findReserveWindowStart(messages, ctx.getUsageSnapshots());
  if (rawReserveStart === 0) {
    return JSON.stringify({ success: false, message: 'Nothing to compact: conversation fits within the reserve window.' });
  }

  const reserveStart = adjustReserveBoundary(messages, rawReserveStart);
  if (reserveStart === 0) {
    return JSON.stringify({ success: false, message: 'Nothing to compact: conversation fits within the reserve window.' });
  }

  const toCompress = messages.slice(0, reserveStart);
  const toKeep = sanitizeMessageList(messages.slice(reserveStart), true);

  // ── Build compact request ────────────────────────────────────────────
  const abortController = new AbortController();
  try {
    const apiConfig = ctx.getApiConfig();
    const langInstr = buildLanguageInstruction(apiConfig.language);

    const sanitizedToCompress = sanitizeMessageList(toCompress);

    const compactMessages: ChatMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT + langInstr + '\n\n' + getStaticHostEnvironmentBlock() },
    ];


    compactMessages.push(
      ...sanitizedToCompress,
      {
        role: 'system',
        content:
          `[COMPACT_REQUEST]\n` +
          `Please generate a concise but complete summary of the conversation history above. This summary will replace the archived portion.\n\n` +
          `Requirements:\n` +
          `- Keep: all files created/modified (with key changes), decisions made, goals, current task state, and any open questions.\n` +
          `- Omit: verbose tool output, repetitive reasoning, step-by-step narration already reflected in outcomes.\n` +
          `- Write in third-person present tense ("The user is building…", "The assistant has modified…").\n` +
          `- End with a short "## Current State" section describing the overall status.\n` +
          `- Use the same language as the conversation history.\n` +
          `[/COMPACT_REQUEST]`,
      },
    );

    const summaryResponse = await sendChatMessage(
      compactMessages,
      apiConfig,
      TOOL_DEFINITIONS,
      abortController.signal,
    );

    const summary = summaryResponse.content?.trim() ?? '(summary unavailable)';

    const summaryMessage: ChatMessage = {
      role: 'user',
      content:
        `📋 **[Conversation history compacted]**\n\n${summary}\n\n> 💡 *${toKeep.length} recent messages preserved; ${toCompress.length} older messages archived.*`,
    };

    ctx.setLlmMessages([summaryMessage, ...toKeep]);
    ctx.resetUsageSnapshots();

    return JSON.stringify({
      success: true,
      message: `Conversation history compacted. Preserved ${toKeep.length} messages, summarised ${toCompress.length}.`,
      summary: summaryMessage.content,
      preserved: toKeep.length,
      summarised: toCompress.length,
    });
  } catch (error: any) {
    if (error.name === 'AbortError') {
      return JSON.stringify({ success: false, message: 'Compact cancelled.' });
    }
    return JSON.stringify({ success: false, message: `Failed to compact history: ${error.message}` });
  }
}
