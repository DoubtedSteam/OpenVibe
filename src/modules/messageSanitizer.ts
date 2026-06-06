import type { ChatMessage, ToolCall } from '../types';

/**
 * Removes assistant turns whose tool_calls never received matching tool results.
 * This is a standalone function that operates on a given array and returns a new copy.
 * Used by compactHistory to sanitize the to-be-compressed messages before sending to API.
 *
 * @param messages - The message array to sanitize.
 * @param preservePendingAssistant - If true, the trailing assistant+tool block (at the end
 *   of the array) is kept even if some tool_calls lack responses, because those responses
 *   are still being generated in the current LLM turn and will be appended after compact
 *   completes. This prevents the tool responses from becoming orphaned `tool` messages.
 */
export function sanitizeMessageList(messages: ChatMessage[], preservePendingAssistant = false): ChatMessage[] {
  const clean: ChatMessage[] = [];
  let i = 0;
  while (i < messages.length) {
    const msg = messages[i];
    if (msg.role === 'assistant' && msg.tool_calls && msg.tool_calls.length > 0) {
      const requiredIds = new Set(msg.tool_calls.map((tc: ToolCall) => tc.id));
      // Collect all consecutive tool messages following this assistant turn
      let j = i + 1;
      while (j < messages.length && messages[j].role === 'tool') {
        j++;
      }
      const toolMessages = messages.slice(i + 1, j);
      const respondedIds = new Set(
        toolMessages
          .filter((m: ChatMessage) => m.tool_call_id)
          .map((m: ChatMessage) => m.tool_call_id!)
      );
      // Only keep this assistant+tool block if every tool_call has a matching response
      if (Array.from(requiredIds).every(id => respondedIds.has(id))) {
        // All tool_calls responded → keep the block
        clean.push(msg);
        clean.push(...toolMessages);
      } else if (preservePendingAssistant && j >= messages.length) {
        // Reached end of array: this is the current turn awaiting tool responses.
        // Keep the assistant (and any partial tool results) so its future tool
        // responses (added by MessageHandler after compact) are not orphaned.
        clean.push(msg);
        clean.push(...toolMessages);
      }
      // Otherwise: incomplete block not at end → remove it (responses will never come)
      i = j;
    } else if (msg.role === 'tool') {
      // Orphaned tool message (no preceding assistant) — skip it
      i++;
    } else {
      clean.push(msg);
      i++;
    }
  }
  return clean;
}
