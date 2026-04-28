import { ChatMessage, ToolCall, ApiConfig, AgentLogEntry, CompressedArchive } from '../types';
import { getAgentRuntimeContextBlock } from '../agentRuntimeContext';
import { sendChatMessage } from '../api';
import { SessionManager } from './SessionManager';
import { loadActivatedSkillInstruction } from '../tools';
import { COMPACT_RESERVE_TOKENS } from '../constants';


/**
 * Owns conversation state and operations on top of {@link SessionManager}.
 *
 * **Multi-agent:** use {@link buildMessagesForLlm} as the single place to assemble
 * `[system, ...turns]` before `sendChatMessage`. Later you can inject handoff
 * transcripts, agent IDs, or merge parallel branches without touching the webview.
 */
export class ConversationService {
  constructor(
    private readonly _session: SessionManager,
    private readonly _getApiConfig: () => ApiConfig,
    private readonly _post: (msg: any) => void,
    /** Callback to retrieve current conversation's activated skill names. */
    private readonly _getActivatedSkills?: () => string[]
  ) {}

  /** Set the activated skills getter after construction (e.g. for circular dependency). */
  public setActivatedSkillsGetter(getter: () => string[]): void {
    (this as any)._getActivatedSkills = getter;
  }

  getCurrentMessages(): ChatMessage[] {
    return this._session.getCurrentMessages();
  }

  addMessage(msg: ChatMessage): void {
    this._session.addMessage(msg);
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
   * If any skills are activated in this conversation, their instructions 
   * are appended to the system prompt.
   */
  buildMessagesForLlm(systemPrompt: string): ChatMessage[] {
    const visible = this.getCurrentMessages().filter((m) => !m.hiddenFromLlm);

    // Append activated skill instructions to the system prompt
    let enrichedPrompt = systemPrompt;
    const skillNames = this._getActivatedSkills?.() ?? [];
    if (skillNames.length > 0) {
      const blocks: string[] = [];
      for (const name of skillNames) {
        const instruction = loadActivatedSkillInstruction(name);
        if (instruction) {
          blocks.push(
            `## Activated skill: ${name}\n${instruction}`
          );
        }
      }
      if (blocks.length > 0) {
        enrichedPrompt +=
          `\n\n---\n## Activated Skills\n` +
          `The following skills are currently active in this conversation. Follow their instructions carefully.\n\n` +
          blocks.join('\n\n');
      }
    }

    return [{ role: 'system', content: enrichedPrompt }, ...visible];
  }

  /**
   * Removes assistant turns whose tool_calls never received matching tool results.
   */
  sanitizeIncompleteToolCalls(): void {
    const messages = this._session.getCurrentMessages();
    let changed = false;
    const clean: ChatMessage[] = [];

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];

      if (msg.role === 'assistant' && msg.tool_calls && msg.tool_calls.length > 0) {
        const requiredIds = new Set(msg.tool_calls.map((tc: ToolCall) => tc.id));
        const rest = messages.slice(i + 1);
        const respondedIds = new Set(
          rest
            .filter((m: ChatMessage) => m.role === 'tool' && m.tool_call_id)
            .map((m: ChatMessage) => m.tool_call_id!)
        );

        if (!Array.from(requiredIds).every(id => respondedIds.has(id))) {
          changed = true;
          let j = i + 1;
          while (j < messages.length && messages[j].role === 'tool') {
            j++;
          }
          i = j - 1;
          continue;
        }
      }

      clean.push(msg);
    }

    if (changed) {
      this._session.setCurrentMessages(clean);
      this._session.saveCurrentSession();
    }
  }

  // ─── Token estimation helpers ────────────────────────────────────────────

  /**
   * Rough token estimation for a string.
   * 1 token ≈ 3.5 characters (blended average for mixed Chinese/English).
   * Errs slightly high for safety.
   */
  private _estimateTokens(text: string): number {
    if (!text) return 0;
    return Math.ceil(text.length / 3.5);
  }

  /** Estimate tokens consumed by a single message (content + metadata overhead). */
  private _estimateMessageTokens(msg: ChatMessage): number {
    let total = 0;
    if (typeof msg.content === 'string') {
      total += this._estimateTokens(msg.content);
    }
    total += 1; // role label overhead
    if (msg.tool_calls) {
      total += msg.tool_calls.length * 20; // overhead per tool call
      for (const tc of msg.tool_calls) {
        total += this._estimateTokens(tc.function.name + tc.function.arguments);
      }
    }
    if (msg.tool_call_id) {
      total += 2;
    }
    return total;
  }

  /**
   * Scan from the end of the message list to find where the reserve window begins.
   * Messages from this index onward are kept intact; everything before is compressed.
   * Returns 0 when no compaction is needed (all messages fit within the reserve window).
   */
  private _findReserveWindowStart(messages: ChatMessage[]): number {
    let tokenCount = 0;
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.hiddenFromLlm) continue;
      tokenCount += this._estimateMessageTokens(msg);
      if (tokenCount > COMPACT_RESERVE_TOKENS) {
        return i + 1;
      }
    }
    return 0;
  }

  /**
   * Build language instruction for the summarizer based on user's API config.
   */
  private _buildCompactLanguageInstruction(): string {
    const apiConfig = this._getApiConfig();
    switch (apiConfig.language) {
      case 'zh-CN':
        return '\n- 请使用简体中文撰写摘要。\n- 使用第三人称现在时。';
      case 'en':
        return '\n- Write the summary in English.\n- Use third-person present tense.';
      default:
        return '\n- Use the same language as the conversation history.\n- Use third-person present tense.';
    }
  }

  // ─── Compact implementation ──────────────────────────────────────────────

  /**
   * Compact conversation history: older messages (outside the 20k-token reserve window)
   * are summarized by an LLM and archived. Recent messages are preserved intact.
   */
  async compactHistory(triggeredByTokenLimit = false): Promise<string> {
    const messages = this._session.getCurrentMessages();
    if (messages.length === 0) {
      const emptyMessage = 'Nothing to compact: conversation is empty.';
      if (triggeredByTokenLimit) {
        this._post({ type: 'info', message: emptyMessage });
      }
      return JSON.stringify({ success: false, message: emptyMessage });
    }

    // ── Find reserve window ──────────────────────────────────────────────
    const reserveStart = this._findReserveWindowStart(messages);
    if (reserveStart === 0) {
      const msg = 'Nothing to compact: conversation fits within the reserve window.';
      if (triggeredByTokenLimit) {
        this._post({ type: 'info', message: msg });
      }
      return JSON.stringify({ success: false, message: msg });
    }

    const toCompress = messages.slice(0, reserveStart);
    const toKeep = messages.slice(reserveStart);

    // ── UI notification ──────────────────────────────────────────────────
    if (!triggeredByTokenLimit) {
      this._post({ type: 'info', message: `🗜️ Compacting ${toCompress.length} older messages, keeping ${toKeep.length} recent messages intact…` });
    } else {
      this._post({ type: 'info', message: `⚡ Context window nearly full — compacting ${toCompress.length} older messages…` });
    }

    // ── Generate summary ─────────────────────────────────────────────────
    const abortController = new AbortController();
    try {
      const apiConfig = this._getApiConfig();

      const historyText = toCompress
        .filter((m) => !m.hiddenFromLlm)
        .filter(m => m.role !== 'tool' || !!m.content)
        .map(m => {
          const roleLabel =
            m.role === 'user' ? 'User' :
            m.role === 'assistant' ? 'Assistant' :
            m.role === 'tool' ? 'Tool result' : 'System';
          const body = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
          return `[${roleLabel}]\n${body}`;
        })
        .join('\n\n---\n\n');

      const langInstr = this._buildCompactLanguageInstruction();

      const summarizePrompt =
        `You are a conversation summarizer. Below is part of a coding-assistant session history.\n` +
        `Your job is to write a CONCISE but COMPLETE summary that will replace this portion.\n\n` +
        `Rules:\n` +
        `- Keep: all files created/modified (with key changes), decisions made, goals, current task state, and any open questions.\n` +
        `- Omit: verbose tool output, repetitive reasoning, step-by-step narration already reflected in outcomes.\n` +
        `- Write in third-person present tense ("The user is building…", "The assistant has modified…").\n` +
        `- End with a short "## Current State" section describing the overall status.` +
        langInstr + '\n\n' +
        `=== CONVERSATION HISTORY ===\n${historyText}\n=== END ===\n\n` +
        `Write the summary now:`;

      const summaryResponse = await sendChatMessage(
        [
          { role: 'system', content: getAgentRuntimeContextBlock() },
          { role: 'user', content: summarizePrompt },
        ],
        apiConfig,
        undefined,
        abortController.signal
      );

      const summary = summaryResponse.content?.trim() ?? '(summary unavailable)';

      // ── Archive original messages ──────────────────────────────────────
      this._session.addCompressedArchive({
        timestamp: Date.now(),
        summary,
        messages: toCompress,
      });

      // ── New message list = [summary, ...toKeep] ────────────────────────
      const summaryMessage: ChatMessage = {
        role: 'assistant',
        content:
          `📋 **[Conversation history compacted]**\n\n${summary}\n\n> 💡 *${toKeep.length} recent messages preserved; ${toCompress.length} older messages archived.*`,
      };

      this._session.setCurrentMessages([summaryMessage, ...toKeep]);

      this._post({ type: 'clearMessages' });
      this._post({ type: 'addMessage', message: { role: 'assistant', content: summaryMessage.content! } });

      if (!triggeredByTokenLimit) {
        this._post({ type: 'info', message: `✅ History compacted. ${toCompress.length} older messages archived, ${toKeep.length} recent messages preserved.` });
      }

      return JSON.stringify({
        success: true,
        message: `Conversation history compacted. Archived ${toCompress.length} messages, preserved ${toKeep.length}.`,
        summary: summaryMessage.content,
        archived: toCompress.length,
        preserved: toKeep.length,
      });
    } catch (error: any) {
      if (error.name === 'AbortError') {
        const abortMessage = 'Compact cancelled.';
        this._post({ type: 'info', message: abortMessage });
        return JSON.stringify({ success: false, message: abortMessage });
      }
      const errorMessage = `Failed to compact history: ${error.message}`;
      this._post({ type: 'error', message: errorMessage });
      return JSON.stringify({ success: false, message: errorMessage });
    }
  }

  /**
   * Replays persisted messages to the webview (bubbles + tool cards).
   */
  replaySessionToWebview(post: (msg: any) => void): void {
    const messages = this._session.getCurrentMessages();
    let i = 0;
    while (i < messages.length) {
      const m = messages[i];
      if (m.role === 'user' && m.content) {
        post({ type: 'addMessage', message: { role: 'user', content: m.content } });
        i++;
        continue;
      }
      if (m.role === 'assistant' && m.tool_calls && m.tool_calls.length > 0) {
        if (m.content) {
          post({ type: 'addMessage', message: { role: 'assistant', content: m.content } });
        }
        i++;
        for (const tc of m.tool_calls) {
          let args: Record<string, unknown> = {};
          try {
            args = JSON.parse(tc.function.arguments);
          } catch {
            /* keep empty */
          }
          post({ type: 'toolCall', name: tc.function.name, args });
          // Tool execution may append UI-only assistant bubbles (hiddenFromLlm) before the tool row.
          while (i < messages.length && messages[i].role === 'assistant' && messages[i].hiddenFromLlm && messages[i].content) {
            post({ type: 'addMessage', message: { role: 'assistant', content: messages[i].content! } });
            i++;
          }
          const tm = messages[i];
          if (tm?.role === 'tool' && tm.tool_call_id === tc.id) {
            post({ type: 'toolResult', name: tc.function.name, result: tm.content ?? '{}', fromReplay: true });
            i++;
          } else {
            post({
              type: 'toolResult',
              name: tc.function.name,
              result: JSON.stringify({ error: 'Missing tool result in saved session' }),
              fromReplay: true,
            });
          }
        }
        continue;
      }
      if (m.role === 'assistant' && m.content && !m.hiddenFromLlm) {
        post({ type: 'addMessage', message: { role: 'assistant', content: m.content } });
        i++;
        continue;
      }
      if (m.role === 'assistant' && m.hiddenFromLlm) {
        i++;
        continue;
      }
      if (m.role === 'tool') {
        i++;
        continue;
      }
      i++;
    }
  }

  /** Drop the user message matching `userContent` and everything after (e.g. Git rollback). */
  truncateBeforeUserMessage(userContent: string): void {
    const msgs = this._session.getCurrentMessages();
    const cutIndex = msgs.findIndex(
      u => u.role === 'user' && (typeof u.content === 'string' ? u.content : '') === userContent
    );
    if (cutIndex !== -1) {
      this._session.setCurrentMessages(msgs.slice(0, cutIndex));
    }
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
