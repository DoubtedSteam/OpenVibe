import { ChatMessage, ToolCall, ApiConfig, AgentLogEntry } from '../types';
import { getAgentRuntimeContextBlock, getStaticHostEnvironmentBlock, buildLanguageInstruction } from '../agentRuntimeContext';
import { SYSTEM_PROMPT } from '../systemPrompt';
import { TOOL_DEFINITIONS } from '../toolDefinitions';
import { sendChatMessage } from '../api';
import { SessionManager } from './SessionManager';
import { COMPACT_RESERVE_TOKENS } from '../constants';
import { replaySessionToWebview } from './webviewReplay';
import { sanitizeMessageList } from './messageSanitizer';
import { compactHistoryFn, findReserveWindowStart, adjustReserveBoundary } from './historyCompactor';


/**
 * Owns conversation state and operations on top of {@link SessionManager}.
 *
 * **Multi-agent:** use {@link buildMessagesForLlm} as the single place to assemble
 * `[system, ...turns]` before `sendChatMessage`. Later you can inject handoff
 * transcripts, agent IDs, or merge parallel branches without touching the webview.
 */
export class ConversationService {
  /** Snapshot of each main LLM call: { msgCount, totalPromptTokens }.
   *  Used by compactHistory to determine the 20k-token reserve window
   *  using accurate API prompt_tokens instead of local character estimation. */
  private _usageSnapshots: Array<{ msgCount: number; totalPromptTokens: number }> = [];

  /** Record a usage snapshot after each main LLM call.
   *  totalPromptTokens = usage.prompt_tokens from the API response
   *  (exact count for the entire prompt including system message). */
  addUsageSnapshot(totalPromptTokens: number): void {
    const llmMessages = this._session.getLlmMessages();
    this._usageSnapshots.push({
      msgCount: llmMessages.length,
      totalPromptTokens,
    });
  }

  /** Reset usage snapshots (e.g. after compact or session switch). */
  resetUsageSnapshots(): void {
    this._usageSnapshots = [];
  }


  constructor(
    private readonly _session: SessionManager,
    private readonly _getApiConfig: () => ApiConfig,
    private readonly _post: (msg: any) => void
  ) {}

  getCurrentMessages(): ChatMessage[] {
    return this._session.getCurrentMessages();
  }

  /** Get the LLM-friendly message list (may be compacted). */
  getLlmMessages(): ChatMessage[] {
    return this._session.getLlmMessages();
  }

  addMessage(msg: ChatMessage): void {
    this._session.addMessage(msg);
  }
  /**
   * Adds a message to a specific session by sessionId.
   * Used when the active session may have changed during async tool execution.
   * Returns true if the session was found.
   */
  addMessageToSession(sessionId: string, msg: ChatMessage): boolean {
    return this._session.addMessageToSession(sessionId, msg);
  }



  /**
   * Adds an event notification message to the chat UI and persists it.
   * Event messages are displayed as compact info banners and are always
   * excluded from LLM context (hiddenFromLlm = true).
   */
  addEventMessage(content: string): void {
    const msg: ChatMessage = { role: 'event', content, hiddenFromLlm: true };
    this._session.addMessage(msg);
    this._post({ type: 'addMessage', message: { role: 'event', content } });
    this._session.saveCurrentSession();
  }

  addAgentLog(entry: AgentLogEntry): void {
    this._session.addAgentLog(entry);
  }

  setCurrentMessages(messages: ChatMessage[]): void {
    this._session.setCurrentMessages(messages);
  }

  getCurrentSessionId(): string {
    return this._session.getCurrentSessionId();
  }

  saveCurrentSession(): void {
    this._session.saveCurrentSession();
  }

  /**
   * Compact all messages tagged with `tag` into a single summary message.
   * - Executor tags: extract last assistant response as summary + modified files + tool count
   * - Evaluator tags: check if todo was modified, keep minimal marker
   */
  compactAgentMessages(tag: string): void {
    const messages = this._session.getCurrentMessages();
    const llmMessages = this._session.getLlmMessages();

    const compactFn = (list: ChatMessage[]): ChatMessage[] => {
      const taggedIndices: number[] = [];
      for (let i = 0; i < list.length; i++) {
        if (list[i].subAgentTag === tag) taggedIndices.push(i);
      }
      if (taggedIndices.length === 0) return list;

      const first = taggedIndices[0];
      const last = taggedIndices[taggedIndices.length - 1];
      const taggedMsgs = list.slice(first, last + 1);

      const compactMsg = ConversationService._buildCompactMessage(tag, taggedMsgs);

      return [...list.slice(0, first), compactMsg, ...list.slice(last + 1)];
    };

    this._session.setCurrentMessages(compactFn(messages));
    if (llmMessages !== messages) {
      this._session.setLlmMessages(compactFn(llmMessages));
    }
    this._session.saveCurrentSession();
  }

  /** Build a compact summary for a set of messages sharing the same subAgentTag. */
  private static _buildCompactMessage(tag: string, messages: ChatMessage[]): ChatMessage {
    const isEvaluator = tag.startsWith('evaluator:');

    if (isEvaluator) {
      const hadTodoMod = messages.some(m =>
        m.role === 'assistant' && m.tool_calls?.some(tc => tc.function.name === 'create_todo_list')
      );
      return {
        role: 'system',
        content: hadTodoMod
          ? `## 🔄 Review (${tag}): todo list was modified`
          : `## ✅ Review (${tag}): plan unchanged`,
        subAgentTag: tag,
      };
    }

    // Executor: extract summary from the last meaningful assistant response
    const assistants = messages.filter(m => m.role === 'assistant' && m.content && !m.hiddenFromLlm);
    const lastAssistant = assistants[assistants.length - 1];
    const summary = lastAssistant?.content?.trim() || '(no summary)';
    const truncated = summary.length > 400 ? summary.slice(0, 400) + '…' : summary;

    // Count tool calls
    const toolCount = messages
      .filter(m => m.role === 'assistant' && m.tool_calls)
      .reduce((sum, m) => sum + (m.tool_calls?.length || 0), 0);

    // Extract modified file paths from tool results
    const modifiedFiles = new Set<string>();
    for (const m of messages) {
      if (m.role === 'tool' && m.content) {
        try {
          const p = JSON.parse(m.content);
          if (typeof p.filePath === 'string') modifiedFiles.add(p.filePath);
        } catch { /* ignore */ }
      }
    }

    const fileList = modifiedFiles.size > 0
      ? '\n- Modified: ' + Array.from(modifiedFiles).map(f => `\`${f}\``).join(', ')
      : '';

    return {
      role: 'system',
      content: `## ✅ Completed (${tag})\n${fileList}\n- Tool calls: ${toolCount}\n- Summary: ${truncated}`,
      subAgentTag: tag,
    };
  }

  /**
   * Calls a lightweight LLM to generate a concise title (one sentence) from the first user message,
   * then updates the current session title. Designed to be called fire-and-forget.
   * Non-critical: on any error (network, API, invalid response) it fails silently.
   */
  async autoNameSession(): Promise<void> {
    // Find the first non-empty user message.
    const messages = this._session.getCurrentMessages();
    const firstUserMsg = messages.find(
      (m) => m.role === 'user' && typeof m.content === 'string' && m.content.trim()
    );
    if (!firstUserMsg || typeof firstUserMsg.content !== 'string') return;
    const text = firstUserMsg.content.trim();

    try {
      const apiConfig = this._getApiConfig();
      const titlePrompt =
        `You are a conversation-naming assistant. Read the user's first message and generate a concise title (one sentence) that captures the topic.` +
        `\n\nRules:\n- Respond with ONLY the title — no quotes, no extra text.\n- Use the same language as the user message.\n- Be specific but concise.\n\nUser message:\n"""\n${text}\n"""\n\nTitle:`;

      const response = await sendChatMessage(
        [
          { role: 'system', content: getAgentRuntimeContextBlock() },
          { role: 'user', content: titlePrompt },
        ],
        { ...apiConfig },
        undefined,
        undefined,
        undefined
      );

      const title = response.content?.trim() ?? '';
      if (title && title.length > 0) {
        const sessionId = this._session.getCurrentSessionId();
        this._session.updateSessionTitle(sessionId, title);
      }
    } catch {
      // Non-critical — fail silently.
    }
  }
  /**
   * Assembles the message list for the main LLM call.
   *
   * Callers should pass a systemPrompt that already includes the static
   * host environment (e.g. SYSTEM_PROMPT + langInstr + getStaticHostEnvironmentBlock()).
   *
   * KV cache prefix structure:
   *   msg[0]: [system] systemPrompt (includes host env) — purely static per session
   *   msg[1]: [system] (optional) Activated Skills       — changes only on skill toggle
   *   msg[2+]: ...conversation turns...
   */
  buildMessagesForLlm(systemPrompt: string): ChatMessage[] {
    const visible = this.getLlmMessages().filter((m) => !m.hiddenFromLlm && m.role !== 'event');

    // ── BTW (By The Way) 上下文过滤 ──────────────────────────────────
    // 找到 visible 中最后一条 user 消息
    let lastUserIdx = -1;
    for (let i = visible.length - 1; i >= 0; i--) {
      if (visible[i].role === 'user') {
        lastUserIdx = i;
        break;
      }
    }
    // 如果最后一条 user 消息是 btwBranch，则上下文 = [历史][btw 对话]（全部保留）
    // 否则过滤掉所有 btwBranch 消息，上下文 = [历史][新对话]
    const isBtwActive = lastUserIdx >= 0 && visible[lastUserIdx].btwBranch === true;
    const filtered = isBtwActive
      ? visible
      : visible.filter((m) => !m.btwBranch);

    // msg[0]: System prompt (caller has merged static host environment inside)
    const messages: ChatMessage[] = [{ role: 'system', content: systemPrompt }];

    messages.push(...filtered);
    return messages;
  }

  /**
   * Removes assistant turns whose tool_calls never received matching tool results.
   * Applies to both frontend and LLM message lists.
   */
  sanitizeIncompleteToolCalls(): void {
    const sanitizeList = (list: ChatMessage[]): ChatMessage[] | null => {
      const result = sanitizeMessageList(list);
      return result.length !== list.length ? result : null;
    };

    const frontend = this._session.getCurrentMessages();
    const cleaned = sanitizeList(frontend);
    if (cleaned) {
      this._session.setCurrentMessages(cleaned);
    }

    // Also clean llmMessages if it exists and differs from frontend
    const llmMessages = this._session.getLlmMessages();
    if (llmMessages !== frontend) {
      const cleanedLlm = sanitizeList(llmMessages);
      if (cleanedLlm) {
        this._session.setLlmMessages(cleanedLlm);
      }
    }
  }

  /**
   * Removes assistant turns whose tool_calls never received matching tool results.
   * This is a standalone version that operates on a given array and returns a new copy.
   * Used by compactHistory to sanitize the to-be-compressed messages before sending to API.
   *
   * @param preservePendingAssistant - If true, the trailing assistant+tool block (at the end
   *   of the array) is kept even if some tool_calls lack responses, because those responses
   *   are still being generated in the current LLM turn and will be appended after compact
   *   completes. This prevents the tool responses from becoming orphaned `tool` messages.
   */
  private _sanitizeMessageList(messages: ChatMessage[], preservePendingAssistant = false): ChatMessage[] {
    return sanitizeMessageList(messages, preservePendingAssistant);
  }

  // ─── Reserve window (based on API prompt_tokens snapshots) ───────────────

  /**
   * Find where to start the reserve window using actual API prompt_tokens.
   * Scans snapshots from the end: the difference between consecutive snapshots'
   * totalPromptTokens reveals how many tokens the messages between them consumed.
   * Messages from the cutoff index onward are kept intact; everything before is compressed.
   * Returns 0 when no compaction is needed (all messages fit within the reserve window).
   */
  private _findReserveWindowStart(messages: ChatMessage[]): number {
    return findReserveWindowStart(messages, this._usageSnapshots);
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
  private _adjustReserveBoundary(messages: ChatMessage[], reserveStart: number): number {
    return adjustReserveBoundary(messages, reserveStart);
  }

  // ─── Compact implementation ──────────────────────────────────────────────

  /**
   * Compact conversation history: older messages (outside the 20k-token reserve window)
   * are sent to the **same main LLM** (same system prompt + original message format)
   * along with a compact instruction, maximizing KV cache hit.
   * Recent messages are preserved intact. Frontend is NOT updated.
   */
  async compactHistory(triggeredByTokenLimit = false): Promise<string> {
    return compactHistoryFn(
      {
        getLlmMessages: () => this._session.getLlmMessages(),
        setLlmMessages: (msgs) => this._session.setLlmMessages(msgs),
        getApiConfig: () => this._getApiConfig(),
        getUsageSnapshots: () => this._usageSnapshots,
        resetUsageSnapshots: () => this.resetUsageSnapshots(),
      },
      triggeredByTokenLimit,
    );
  }

  /**
   * Replays persisted messages to the webview (bubbles + tool cards).
    * Strips any remaining <edit-content> tags from stored content as a safety net.
    */
  replaySessionToWebview(post: (msg: any) => void): void {
    replaySessionToWebview(this._session.getCurrentMessages(), post);
  }

  /** Drop the user message matching `userContent` and everything after (e.g. Git rollback). */
  truncateBeforeUserMessage(userContent: string): void {
    // Truncate full messages (webview display)
    const msgs = this._session.getCurrentMessages();
    const cutIndex = msgs.findIndex(
      u => u.role === 'user' && typeof u.content === 'string' && u.content.includes(userContent)
    );
    if (cutIndex !== -1) {
      this._session.setCurrentMessages(msgs.slice(0, cutIndex));
    }

    // Also truncate llmMessages (LLM context) by the same userContent.
    // If llmMessages exists separately (after compact), keep it in sync;
    // otherwise getLlmMessages() already falls back to messages.
    const llmMsgs = this._session.getLlmMessages();
    const llmCutIndex = llmMsgs.findIndex(
      u => u.role === 'user' && typeof u.content === 'string' && u.content.includes(userContent)
    );
    if (llmCutIndex !== -1) {
      this._session.setLlmMessages(llmMsgs.slice(0, llmCutIndex));
    }

    // Reset usage snapshots since the message structure changed
    this.resetUsageSnapshots();
  }

  /**
   * Latest non-empty user message in the current session (for tool-side todolist review).
   */
  getLastUserTextForTools(): string {
    const messages = this.getCurrentMessages();
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.role === 'user' && typeof m.content === 'string' && m.content.trim()) {
        return m.content.trim();
      }
    }
    return '';
  }

  /**
   * Recent assistant natural-language context before tools (trimmed), for todolist review "related context".
   */
  getRelatedContextForTodolistReview(maxLen = 2500): string {
    const messages = this.getCurrentMessages();
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.role !== 'assistant' || m.hiddenFromLlm) {
        continue;
      }
      const c = typeof m.content === 'string' ? m.content.trim() : '';
      if (!c) {
        continue;
      }
      let out = c;
      if (out.length > maxLen) {
        out = out.slice(0, maxLen) + '\n[…]';
      }
      return out;
    }
    return '';
  }
}
