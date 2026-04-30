import { ChatMessage, ToolCall, ApiConfig, AgentLogEntry } from '../types';
import { getAgentRuntimeContextBlock } from '../agentRuntimeContext';
import { SYSTEM_PROMPT } from '../systemPrompt';
import { TOOL_DEFINITIONS } from '../toolDefinitions';
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

  /** Get the LLM-friendly message list (may be compacted). */
  getLlmMessages(): ChatMessage[] {
    return this._session.getLlmMessages();
  }

  addMessage(msg: ChatMessage): void {
    this._session.addMessage(msg);
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
    const visible = this.getLlmMessages().filter((m) => !m.hiddenFromLlm && m.role !== 'event');

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
   * Applies to both frontend and LLM message lists.
   */
  sanitizeIncompleteToolCalls(): void {
    const sanitizeList = (list: ChatMessage[]): ChatMessage[] | null => {
      let changed = false;
      const clean: ChatMessage[] = [];
      for (let i = 0; i < list.length; i++) {
        const msg = list[i];
        if (msg.role === 'assistant' && msg.tool_calls && msg.tool_calls.length > 0) {
          const requiredIds = new Set(msg.tool_calls.map((tc: ToolCall) => tc.id));
          const rest = list.slice(i + 1);
          const respondedIds = new Set(
            rest
              .filter((m: ChatMessage) => m.role === 'tool' && m.tool_call_id)
              .map((m: ChatMessage) => m.tool_call_id!)
          );
          if (!Array.from(requiredIds).every(id => respondedIds.has(id))) {
            changed = true;
            let j = i + 1;
            while (j < list.length && list[j].role === 'tool') {
              j++;
            }
            i = j - 1;
            continue;
          }
        }
        clean.push(msg);
      }
      return changed ? clean : null;
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
   */
  private _sanitizeMessageList(messages: ChatMessage[]): ChatMessage[] {
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
          clean.push(msg);
          clean.push(...toolMessages);
        }
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

  // ─── Token estimation helpers ────────────────────────────────────────────

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
      if (msg.hiddenFromLlm || msg.role === 'event') continue;
      tokenCount += this._estimateMessageTokens(msg);
      if (tokenCount > COMPACT_RESERVE_TOKENS) {
        return i + 1;
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
  private _adjustReserveBoundary(messages: ChatMessage[], reserveStart: number): number {
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
   * Mirrors MessageHandler._buildLanguageInstruction() to ensure the same
   * system prompt text is used in compact requests for KV cache compatibility.
   */
  private _buildLanguageInstruction(lang: string | undefined): string {
    switch (lang) {
      case 'zh-CN':
        return '\n\n## Language\n请以简体中文与用户进行沟通。';
      case 'en':
        return '\n\n## Language\nPlease communicate with the user in English.';
      default:
        return '';
    }
  }

  // ─── Compact implementation ──────────────────────────────────────────────

  /**
   * Compact conversation history: older messages (outside the 20k-token reserve window)
   * are sent to the **same main LLM** (same system prompt + original message format)
   * along with a compact instruction, maximizing KV cache hit.
   * Recent messages are preserved intact. Frontend is NOT updated.
   */
  async compactHistory(triggeredByTokenLimit = false): Promise<string> {
    // Only compact the LLM message list; frontend (full messages) is untouched.
    const messages = this._session.getLlmMessages();
    if (messages.length === 0) {
      return JSON.stringify({ success: false, message: 'Nothing to compact: conversation is empty.' });
    }

    // ── Find reserve window ──────────────────────────────────────────────
    const rawReserveStart = this._findReserveWindowStart(messages);
    if (rawReserveStart === 0) {
      return JSON.stringify({ success: false, message: 'Nothing to compact: conversation fits within the reserve window.' });
    }

    // Adjust boundary so assistant(tool_calls)+tool blocks stay intact
    const reserveStart = this._adjustReserveBoundary(messages, rawReserveStart);
    if (reserveStart === 0) {
      return JSON.stringify({ success: false, message: 'Nothing to compact: conversation fits within the reserve window.' });
    }

    const toCompress = messages.slice(0, reserveStart);
    const toKeep = this._sanitizeMessageList(messages.slice(reserveStart));

    // ── Build compact request (reuse main LLM + original messages) ────────
    const abortController = new AbortController();
    try {
      const apiConfig = this._getApiConfig();
      const langInstr = this._buildLanguageInstruction(apiConfig.language);

      const compactSystemPrompt = SYSTEM_PROMPT + '\n\n\n' + getAgentRuntimeContextBlock() + langInstr;

      // Sanitize toCompress before sending: remove any incomplete assistant+tool sequences
      // (e.g. assistant with tool_calls but no matching tool results) to prevent API 400 errors
      // caused by violating the "assistant tool_calls must be followed by tool responses" constraint.
      const sanitizedToCompress = this._sanitizeMessageList(toCompress);

      const compactMessages: ChatMessage[] = [
        { role: 'system', content: compactSystemPrompt },
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
      ];

      const summaryResponse = await sendChatMessage(
        compactMessages,
        apiConfig,
        TOOL_DEFINITIONS,
        abortController.signal
      );

      const summary = summaryResponse.content?.trim() ?? '(summary unavailable)';

      // ── Replace LLM message list = [summary, ...toKeep] ─────────────────
      // Frontend (full messages) is NOT updated.
      const summaryMessage: ChatMessage = {
        role: 'user',
        content:
          `📋 **[Conversation history compacted]**\n\n${summary}\n\n> 💡 *${toKeep.length} recent messages preserved; ${toCompress.length} older messages archived.*`,
      };

      this._session.setLlmMessages([summaryMessage, ...toKeep]);

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

  /**
   /**
    * Replays persisted messages to the webview (bubbles + tool cards).
    * Strips any remaining <edit-content> tags from stored content as a safety net.
    */
  replaySessionToWebview(post: (msg: any) => void): void {
    const messages = this._session.getCurrentMessages();
    // Strip <edit-content> tags from content for display safety
    const stripTags = (text: string): string => {
      let cleaned = text.replace(/<edit-content>[\s\S]*?<\/edit-content>/gi, '').trim();
      // Clean up empty code fences that may result from tag stripping
      cleaned = cleaned.replace(/```\s*```/g, '');
      return cleaned;
    };
    // Strip the ─── Context ─── block (runtime LLM metadata) from user messages
    // to prevent it from leaking to the user on window reload.
    const stripContextBlock = (text: string): string => {
      return text.replace(/─── Context ───\n[\s\S]*?\n────────────────\n\n/, '');
    };
    let i = 0;
    while (i < messages.length) {
      const m = messages[i];
      if (m.role === 'user' && m.content) {
        post({ type: 'addMessage', message: { role: 'user', content: stripContextBlock(stripTags(m.content)) } });
        i++;
        continue;
      }
      if (m.role === 'assistant' && m.tool_calls && m.tool_calls.length > 0) {
        if (m.content) {
          post({ type: 'addMessage', message: { role: 'assistant', content: stripTags(m.content) } });
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
            post({ type: 'addMessage', message: { role: 'assistant', content: stripTags(messages[i].content!) } });
            i++;
          }
          const tm = messages[i];
          if (tm?.role === 'tool' && tm.tool_call_id === tc.id) {
            post({ type: 'toolResult', name: tc.function.name, result: tm.content ?? '{}', fromReplay: true });
            i++;
            // ── task_complete: 从 tool 结果中重建修改文件列表显示 ─────────
            if (tc.function.name === 'task_complete') {
              try {
                const parsed = JSON.parse(tm.content ?? '{}') as {
                  modifiedFiles?: string[];
                  summary?: string;
                };
                if (parsed.modifiedFiles && Array.isArray(parsed.modifiedFiles)) {
                  const fileListStr = parsed.modifiedFiles.length > 0
                    ? parsed.modifiedFiles.map((f: string) => `- \`${f}\``).join('\n')
                    : '(无文件修改)';
                  const fileSummary = parsed.modifiedFiles.length > 0
                    ? `\n\n**📄 本次修改了 ${parsed.modifiedFiles.length} 个文件**:\n${fileListStr}`
                    : '';
                  // 将 summary 中 "xxx；1) yyy；2) zzz" 格式自动变为换行列表
                  const fmtSummary = parsed.summary
                    ? parsed.summary.replace(/[；;]\s*(?=\d+[)\.])/g, '\n')
                    : '';
                  const summaryBlock = fmtSummary ? `\n\n${fmtSummary}` : '';
                  const displayContent = `✅ **任务完成**${summaryBlock}${fileSummary}`;
                  post({ type: 'addMessage', message: { role: 'assistant', content: displayContent } });
                }
              } catch {
                /* ignore parse errors */
              }
            }
          } else {
            // Tool call with no matching result (e.g. interrupted by reload).
            // For ask_human, show a clear system message instead of a cryptic error.
            if (tc.function.name === 'ask_human') {
              const question = (args && typeof args.question === 'string') ? args.question : '';
              post({
                type: 'addMessage',
                message: {
                  role: 'system',
                  content: `⏸️ **之前的对话已中断**\n\nAI 正在等待你的回复：\n> ${question || '(问题内容不可用)'}\n\n💡 _请发送新消息继续对话。_\n\n> _提示：之前未完成的请求已自动取消。_`,
                },
              });
            } else {
              post({
                type: 'toolResult',
                name: tc.function.name,
                result: JSON.stringify({ error: 'Missing tool result in saved session' }),
                fromReplay: true,
              });
            }
          }
        }
        continue;
      }
      if (m.role === 'assistant' && m.content && !m.hiddenFromLlm) {
        post({ type: 'addMessage', message: { role: 'assistant', content: stripTags(m.content) } });
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
      if (m.role === 'event' && m.content) {
        post({ type: 'addMessage', message: { role: 'event', content: m.content } });
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
