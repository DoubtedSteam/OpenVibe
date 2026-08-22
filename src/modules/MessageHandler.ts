import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { ChatMessage, ApiConfig } from '../types';
import { getActiveEditorInfo, getStaticHostEnvironmentBlock, buildLanguageInstruction, getDateInfo } from '../agentRuntimeContext';
import { SYSTEM_PROMPT } from '../systemPrompt';
import { getVisibleToolDefinitions } from '../tools/toolProfiles';
import { sendChatMessage } from '../api';
import { gitSnapshotTool } from '../tools';
import { AUTO_COMPACT_TOKEN_THRESHOLD } from '../constants';
import type { OperationController } from '../operationController';

export class MessageHandler {
  private _isRunning = false;
  /** Captured at handleUserMessage start — used to route messages to the correct session. */
  private _originSessionId: string | null = null;
  /** Cumulative token usage across all LLM calls in this session. */
  private _accumulatedUsage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };



  constructor(
    private readonly _context: {
      getApiConfig: () => ApiConfig;
      post: (message: any) => void;
      /** Assembled system + history; extension point for multi-agent. */
      buildMessagesForLlm: (systemPrompt: string) => ChatMessage[];
      addMessage: (message: ChatMessage) => void;
      /** Add message to a specific session by sessionId (for cross-session routing during async ops). */
      addMessageToSession: (sessionId: string, message: ChatMessage) => boolean;
      getCurrentSessionId: () => string;
      /** Record the latest context length (prompt_tokens) for the current conversation (per-session token usage). */
      setCurrentSessionTokenContext: (promptTokens: number) => void;

      saveCurrentSession: () => void;
      sanitizeIncompleteToolCalls: () => void;
      executeTool: (name: string, args: Record<string, unknown>) => Promise<string>;
      getTodoControlInfo: () => { goal: string; list: string; remaining: number; firstPendingIndex: number } | null;
      getTodoItemText: (index: number) => string | null;
      getSessionEditedFiles: () => string[];
      getEditPermissionEnabled: () => boolean;
      compactHistory: (triggeredByTokenLimit?: boolean) => Promise<string>;
      /** Record a usage snapshot (prompt_tokens from API) for reserve window calculation. */
      addUsageSnapshot: (promptTokens: number) => void;
      /** Reset per-turn UI counters (e.g. edit review #) when the user sends a new instruction. */
      onUserInstructionStart?: () => void;
      /** Shared operation controller used across main + sub agents. */
      operation: OperationController;
      /** Side-effects to run on stop (e.g. resolve confirm bars). */
      onStopSideEffects?: () => void;
      /** Fire-and-forget: auto-name the session after the first user message. */
      autoNameSession?: () => void;
      /** Configure which tools are blocked in the current sub-agent scope. */
      setBlockedTools?: (tools: string[]) => void;
      /** Compact all messages with the given subAgentTag into a summary message. */
      compactAgentMessages?: (tag: string) => void;
      /** Whether harness memory sync tracking (L2) is enabled via vibe-coding.memorySync.enabled. */
      getMemorySyncEnabled: () => boolean;
    }
  ) {}

  /** Current sub-agent tag stamped on new messages. */
  private _currentTag: string = 'free';
  /**
   * Only posts content-bearing messages (addMessage, toolCall, toolResult) to the webview
   * if the active session hasn't changed since the operation started.
   * Control messages (info, error, loading, setRunning) always pass through
   * so the webview stays responsive.
   */
  private _postIfSameSession(msg: any): void {
    const isContent = msg.type === 'addMessage' || msg.type === 'toolCall' || msg.type === 'toolResult';
    if (isContent && this._originSessionId !== null) {
      const currentId = this._context.getCurrentSessionId();
      if (currentId !== this._originSessionId) {
        return; // Session changed — don't pollute the wrong conversation's UI
      }
    }
    this._context.post(msg);
  }

  /** Add a message to the session, auto-stamping subAgentTag from current scope. */
  private _addTaggedMessage(msg: ChatMessage): void {
    this._context.addMessageToSession(this._originSessionId!, {
      ...msg,
      subAgentTag: msg.subAgentTag ?? this._currentTag,
    });
  }



  public async handleUserMessage(text: string): Promise<void> {
    if (this._isRunning) { return; }

    this._context.sanitizeIncompleteToolCalls();
    this._originSessionId = this._context.getCurrentSessionId();

    this._isRunning = true;
    this._context.operation.reset();
    this._context.post({ type: 'setRunning', running: true });

    // /compact 命令直接触发压缩，不进入 LLM 循环
    if (text.trim() === '/compact') {
      try {
        const result = await this._context.compactHistory(false);
        const parsed = JSON.parse(result);
        if (parsed.success) {
          this._context.post({ type: 'info', message: `🗜️ 对话历史已压缩：摘要 ${parsed.summarised} 条消息，保留 ${parsed.preserved} 条。` });
        } else {
          this._context.post({ type: 'info', message: parsed.message || '压缩失败。' });
        }
      } catch (e: any) {
        this._context.post({ type: 'error', message: `压缩失败: ${e.message}` });
      } finally {
        this._context.post({ type: 'loading', loading: false });
        this._context.post({ type: 'setRunning', running: false });
        this._isRunning = false;
      }
      return;
    }


    // ── BTW (By The Way) 检测 ───────────────────────────────────────
    // 以 \btw 开头的消息启动一个临时子对话。
    // 连续的 \btw 消息累计在子对话中，一旦遇到非 \btw 消息则子对话结束。
    let isBtw = false;
    let displayText = text;
    if (text && text.trimStart().startsWith('\\btw')) {
      isBtw = true;
      // 剥离 \btw 前缀及后续空格
      const stripped = text.trimStart().slice(4).trimStart();
      displayText = stripped;
      text = stripped;
    }

    // Empty message = "continue" signal; add placeholder to conversation history for LLM context.
    if (text) {
      // Resolve @ references before storing the message
      text = await this._resolveReferences(text);

      this._context.onUserInstructionStart?.();
      // 尝试创建Git快照（静默失败，不影响主流程）
      try {
        gitSnapshotTool({
          sessionId: this._context.getCurrentSessionId(),
          userInstruction: text,
          description: `Auto-snapshot before processing user instruction`
        });
      } catch {
        /* no Git repo or snapshot failure — non-fatal */
      }
      // Build user message with per-turn context only.
      // Static Host Environment is merged into system msg[0] (by buildMessagesForLlm caller),
      // so it's NOT duplicated here to save tokens and keep user message compact.
      const ctxLines: string[] = [];
      ctxLines.push(`🔓 Edit: ${this._context.getEditPermissionEnabled() ? 'ON' : 'OFF'}`);
      ctxLines.push(`📅 Date: ${getDateInfo()}`);
      const todoInfo = this._context.getTodoControlInfo();
      if (todoInfo && todoInfo.remaining > 0) {
        ctxLines.push(`📋 Todo: ${todoInfo.remaining} item(s) remaining`);
      }
      // Active Editor changes per file switch — embedded here so it doesn't
      // disrupt the stable system message prefix KV cache.
      const activeInfo = getActiveEditorInfo();
      if (activeInfo) {
        ctxLines.push(`\n## Active Editor (实时追踪)\n${activeInfo.trimEnd()}`);
      }
      const ctxBlock = `─── Context ───\n${ctxLines.join('\n')}\n────────────────\n\n`;
      const enrichedText = ctxBlock + text;

      // 显示时剥离 \btw 前缀
      this._postIfSameSession({ type: 'addMessage', message: { role: 'user', content: displayText } });
      this._addTaggedMessage( {
        role: 'user',
        content: enrichedText,
        btwBranch: isBtw || undefined,
      });
      // Fire-and-forget: auto-name the session from the first user message.
      this._context.autoNameSession?.();
    } else {
      // 空消息：添加占位消息，让LLM知道用户想继续
      const placeholder = "[继续]";
      this._postIfSameSession({ type: 'addMessage', message: { role: 'user', content: placeholder } });
      this._addTaggedMessage( { role: 'user', content: placeholder });
    }
    
    this._context.post({ type: 'loading', loading: true });
    
    try {
      // ── Phase 1: Free mode ───────────────────────────────────────────
      // LLM explores, plans, may create todo list. All tools available.
      await this._agentPhase('free', []);

      // ── Phase 2: Scheduling mode ─────────────────────────────────────
      // If a todo list was created, dispatch executor + evaluator agents.
      // Returns true if any sub-agents were actually dispatched.
      const didSchedule = await this._schedulingLoop();

      // ── Phase 3: Final free mode ─────────────────────────────────────
      // Only run if scheduling actually happened — the evaluator may have
      // modified the todo list, and the LLM needs to wrap up.
      if (didSchedule && !this._context.operation.isStopped()) {
        await this._agentPhase('free', []);
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        this._context.post({ type: 'info', message: 'Operation stopped by user.' });
      } else {
        this._context.post({ type: 'error', message: error.message });
      }
    } finally {
      this._context.post({ type: 'loading', loading: false });
      this._context.post({ type: 'setRunning', running: false });
      this._isRunning = false;
    }
  }

  /**
   * Run the core LLM → tools loop until no-tool-calls or stop.
   * Messages are tagged with the given subAgentTag.
   * Blocked tools are configured on ToolExecutor before the loop starts.
   */
  private async _agentPhase(tag: string, blockedTools: string[]): Promise<void> {
    this._currentTag = tag;
    this._context.setBlockedTools?.(blockedTools);

    const apiConfig = this._context.getApiConfig();
    while (!this._context.operation.isStopped()) {

      if (this._context.operation.isStopped()) {
        this._context.post({ type: 'info', message: 'Operation stopped by user.' });
        break;
      }

      const langInstr = buildLanguageInstruction(apiConfig.language);
      const allMessages = this._context.buildMessagesForLlm(SYSTEM_PROMPT + langInstr + '\n\n' + getStaticHostEnvironmentBlock());

      const response = await sendChatMessage(allMessages, apiConfig, getVisibleToolDefinitions(), this._context.operation.signal());
      const hasPendingToolCalls = !!(response.toolCalls && response.toolCalls.length > 0);
      this._accumulateAndSendUsage(response.tokenUsage, hasPendingToolCalls);

      if (this._context.operation.isStopped()) {
        this._context.post({ type: 'info', message: 'Operation stopped by user.' });
        break;
      }

      if (response.toolCalls && response.toolCalls.length > 0) {
        // NOTE: <edit-content> XML fallback was removed (2026-08-22).
        // Tool call arguments are pure JSON strings — newContent/command carry
        // the full text directly (JSON escaping handles newlines/quotes).
        const displayContent = response.content || '';

        this._addTaggedMessage({
          role: 'assistant',
          content: displayContent,
          reasoning_content: response.reasoningContent,
          tool_calls: response.toolCalls,
        });

        if (displayContent) {
          this._postIfSameSession({ type: 'addMessage', message: { role: 'assistant', content: displayContent } });
        }

        let stopAfterTools = false;
        for (const toolCall of response.toolCalls) {
          if (this._context.operation.isStopped()) {
            this._context.post({ type: 'info', message: 'Operation stopped by user.' });
            break;
          }

          const name = toolCall.function.name;
          const rawArgs = toolCall.function.arguments;
          let args: Record<string, unknown>;
          try {
            args = JSON.parse(rawArgs);
          } catch (e: any) {
            // Arguments JSON 解析失败：返回错误要求模型重试，
            // 绝不带空参数执行工具（避免 edit 空 newContent 静默删除）。
            const errResult = JSON.stringify({
              error:
                `Tool call arguments JSON parse failed for '${name}': ${e?.message ?? 'invalid JSON'}. ` +
                'Please regenerate valid JSON arguments and retry.',
            });
            this._postIfSameSession({ type: 'toolResult', name, result: errResult });
            this._addTaggedMessage({ role: 'tool', content: errResult, tool_call_id: toolCall.id });
            continue;
          }


          // task_complete
          if (name === 'task_complete') {
            const modifiedFiles = this._context.getSessionEditedFiles();
            const fileListStr = modifiedFiles.length > 0
              ? modifiedFiles.map(f => `- \`${f}\``).join('\n')
              : '(无文件修改)';
            const fileSummary = modifiedFiles.length > 0
              ? `\n\n**📄 本次修改了 ${modifiedFiles.length} 个文件**:\n${fileListStr}`
              : '';
            const memoryHint = modifiedFiles.length > 0
              ? 'Task complete. ⚠️ MEMORY SYNC REQUIRED: this task modified files — before editing .OpenVibe/memory/ next, check whether new/removed files need L2-inventory.md updates and whether changed components need L3-roles.md updates (code is the source of truth). Modified files:\n' +
                modifiedFiles.map(f => `- ${f}`).join('\n')
              : 'Task complete. No files modified — memory sync not required.';
            const summary = (args['summary'] as string) || '';
            const result = JSON.stringify({
              success: true, operation: 'task_complete',
              message: 'Task marked complete. ' + memoryHint, summary, modifiedFiles,
            });
            this._postIfSameSession({ type: 'toolResult', name, result });
            this._addTaggedMessage({ role: 'tool', content: result, tool_call_id: toolCall.id });
            const fmtSummary = summary ? summary.replace(/[；;]\s*(?=\d+[)\.])/g, '\n') : '';
            const summaryBlock = fmtSummary ? `\n\n${fmtSummary}` : '';
            const displayTaskComplete = `✅ **任务完成**${summaryBlock}${fileSummary}`;
            this._postIfSameSession({ type: 'addMessage', message: { role: 'assistant', content: displayTaskComplete } });
            this._addTaggedMessage({ role: 'assistant', content: displayTaskComplete, hiddenFromLlm: true });
            stopAfterTools = true;
            break;
          }

          // advance_todo_item — marks current item done and signals to advance
          if (name === 'advance_todo_item') {
            const result = await this._context.executeTool(name, args);
            this._postIfSameSession({ type: 'toolResult', name, result });
            this._addTaggedMessage({ role: 'tool', content: result, tool_call_id: toolCall.id });
            try {
              const parsed = JSON.parse(result);
              if (parsed.success && parsed._advance) {
                const itemSummary = (args['summary'] as string) || 'Completed';
                const displayText = `✅ **${itemSummary}**`;
                this._postIfSameSession({ type: 'addMessage', message: { role: 'assistant', content: displayText } });
                this._addTaggedMessage({ role: 'assistant', content: displayText, hiddenFromLlm: true });
                stopAfterTools = true;
                break;
              }
            } catch { /* fall through */ }
          }

          this._postIfSameSession({ type: 'toolCall', name, args });

          let result: string;
          try {
            if (name === 'compact') {
              if (this._currentTag !== 'free') {
                result = JSON.stringify({
                  success: false,
                  message: 'Compact is only available in free mode, not during sub-agent execution.',
                });
              } else {
                result = await this._context.compactHistory(false);
              }
            } else if (name === 'ask_human') {
              try { result = await this._context.executeTool(name, args); }
              catch (e: any) { result = JSON.stringify({ error: e.message }); }
              const parsed = JSON.parse(result);
              this._postIfSameSession({ type: 'toolResult', name, result });
              this._addTaggedMessage({ role: 'tool', content: result, tool_call_id: toolCall.id });
              if (parsed.success) {
                const userText = parsed.cancelled
                  ? `[User cancelled: ${parsed.question}]`
                  : parsed.message || '[User responded]';
                this._postIfSameSession({ type: 'addMessage', message: { role: 'user', content: userText } });
                this._addTaggedMessage({ role: 'user', content: userText });
              }
              break;
            } else {
              result = await this._context.executeTool(name, args);
            }
          } catch (e: any) {
            result = JSON.stringify({ error: e.message });
          }

          if (name !== 'ask_human') {
            this._postIfSameSession({ type: 'toolResult', name, result });
            this._addTaggedMessage({ role: 'tool', content: result, tool_call_id: toolCall.id });
          }
        }
        if (stopAfterTools) break;
      } else {
        let content = response.content ?? '(no response)';
        this._addTaggedMessage({ role: 'assistant', content, reasoning_content: response.reasoningContent });
        this._postIfSameSession({ type: 'addMessage', message: { role: 'assistant', content } });
        break;
      }
    }
  }

  /**
   * Scheduling mode: iterate through todo items, running an executor agent
   * (blocked from modifying the todo), then a free-mode review where the LLM
   * naturally verifies results and calls advance_todo_item to proceed.
   */
  /** Returns true if any sub-agents were actually dispatched. */
  private async _schedulingLoop(): Promise<boolean> {
    let dispatched = false;
    while (!this._context.operation.isStopped()) {
      const todoInfo = this._context.getTodoControlInfo();
      if (!todoInfo || todoInfo.remaining === 0) break;

      const itemIndex = todoInfo.firstPendingIndex;
      if (itemIndex < 0) break;

      const itemText = this._context.getTodoItemText(itemIndex) || `Item ${itemIndex + 1}`;
      dispatched = true;

      // ── Executor Agent ──────────────────────────────────────────
      const execTag = `executor:${itemIndex}`;
      this._addTaggedMessage({
        role: 'system',
        content: `## Sub-task\n\n${itemText}`,
        subAgentTag: execTag,
      });
      this._postIfSameSession({
        type: 'addMessage',
        message: { role: 'system', content: `📋 **Working on: ${itemText}**` },
      });

      await this._agentPhase(execTag, ['create_todo_list']);

      if (this._context.operation.isStopped()) break;

      // ── Compact executor ───────────────────────────────────────
      this._context.compactAgentMessages?.(execTag);
      // ── Memory Sync (L2, harness-enforced) ──────────────────────
      // 检测本轮已修改但未登记于 L2-inventory.md 的文件，
      // 由 free review agent 在确认完成前统一同步（接触即记录）。
      // 受 vibe-coding.memorySync.enabled 配置开关控制。
      if (this._context.getMemorySyncEnabled()) {
        const pendingSync = this._pendingL2SyncFiles();
        if (pendingSync.length > 0) {
          this._addTaggedMessage({
            role: 'system',
            content:
              `## Memory Sync (harness-enforced)\n\n` +
              `以下文件已被修改，但尚未登记在 \`.OpenVibe/memory/L2-inventory.md\`（增量学习规范：接触即记录）：\n` +
              pendingSync.map((f) => `- \`${f}\``).join('\n') +
              `\n\n在确认当前 todo item 完成并调用 \`advance_todo_item\` 之前，请用 edit 工具为上述每个文件在 L2-inventory.md 中添加条目（路径 + 一行描述 + 关键导出/依赖）。已登记或属于 \`.OpenVibe/memory/\` 自身的文件无需操作。`,
            subAgentTag: 'free',
          });
        }
      }

      // ── Free Review (replaces evaluator) ───────────────────────
      // All tools available; LLM follows its natural workflow (including
      // any activated skill instructions) to verify and call advance_todo_item.
      const remainingCount = todoInfo.remaining;
      this._addTaggedMessage({
        role: 'system',
        content: `## Review\n\nVerify that "${itemText}" is complete. ` +
          `Call \`advance_todo_item\` with a brief summary when satisfied, ` +
          `or continue working if fixes are needed.\n\nRemaining items: ${remainingCount}`,
        subAgentTag: 'free',
      });
      this._postIfSameSession({
        type: 'addMessage',
        message: { role: 'system', content: `🔍 **Reviewing: ${itemText}**` },
      });

      await this._agentPhase('free', []);

      // If advance_todo_item was NOT called (LLM stopped without advancing),
      // the item remains pending and we'll loop around to it again.
    }
    return dispatched;
  }

  public stopCurrentOperation(): void {
    if (this._isRunning) {
      this._context.onStopSideEffects?.();
      this._context.operation.stop();
      this._context.post({ type: 'info', message: 'Stopping current operation...' });
    }
  }

  /**
  /**
   * Resolve @ references in user input.
   * Supports:
   *   @file:path    — Read file content and embed as context
   *   @problem      — Embed current VS Code diagnostics
   *   @selection    — Embed active editor selection
   *   @active       — Embed the content of the currently active file
   */
  private async _resolveReferences(text: string): Promise<string> {
    let result = text;

    // 1. Resolve @file:path — read file content
    const fileRefRe = /@file:(\S+)/g;
    let fm: RegExpExecArray | null;
    while ((fm = fileRefRe.exec(result)) !== null) {
      const raw = fm[0];
      const relPath = fm[1];
      try {
        const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!root) continue;
        const absPath = path.resolve(root, relPath);
        if (!fs.existsSync(absPath)) {
          result = result.replace(raw, `\n> ⚠️ 文件未找到: \`${relPath}\`\n`);
          continue;
        }
        const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(absPath));
        const content = doc.getText();
        const ext = path.extname(relPath).slice(1) || 'plaintext';
        const block = `\n\n> 📄 **引用文件: \`${relPath}\`**\n\`\`\`${ext}\n${content}\n\`\`\`\n`;
        result = result.replace(raw, block);
      } catch (e: any) {
        result = result.replace(raw, `\n> ⚠️ 读取文件失败: \`${relPath}\` — ${e.message}\n`);
      }
    }

    // 2. Resolve @problem — current diagnostics
    if (result.includes('@problem')) {
      const allDiags = vscode.languages.getDiagnostics();
      const lines: string[] = [];
      for (const [uri, diags] of allDiags) {
        for (const d of diags) {
          const filePath = vscode.workspace.asRelativePath(uri);
          const line = d.range.start.line + 1;
          const sev = d.severity === vscode.DiagnosticSeverity.Error ? '❌' :
                      d.severity === vscode.DiagnosticSeverity.Warning ? '⚠️' : 'ℹ️';
          lines.push(`- ${sev} \`${filePath}:${line}\` ${d.message}`);
        }
      }
      const block = lines.length > 0
        ? `\n\n> 🔴 **当前诊断错误 (${lines.length} 条)**\n${lines.slice(0, 30).join('\n')}${lines.length > 30 ? `\n> … 还有 ${lines.length - 30} 条` : ''}\n`
        : '\n\n> ✅ 当前无诊断错误\n';
      result = result.replace(/@problem/g, block);
    }

    // 3. Resolve @selection — active editor selection
    if (result.includes('@selection')) {
      const editor = vscode.window.activeTextEditor;
      if (editor && !editor.selection.isEmpty) {
        const selection = editor.selection;
        const text = editor.document.getText(selection);
        const filePath = vscode.workspace.asRelativePath(editor.document.uri);
        const ext = path.extname(filePath).slice(1) || 'plaintext';
        const startLine = selection.start.line + 1;
        const block = `\n\n> ✂️ **选中代码: \`${filePath}:${startLine}\`**\n\`\`\`${ext}\n${text}\n\`\`\`\n`;
        result = result.replace(/@selection/g, block);
      } else {
        result = result.replace(/@selection/g, '\n\n> ⚠️ 当前没有选中任何代码\n');
      }
    }

    // 4. Resolve @active — currently active file content
    if (result.includes('@active')) {
      const editor = vscode.window.activeTextEditor;
      if (editor && editor.document.uri.scheme === 'file') {
        const doc = editor.document;
        const filePath = vscode.workspace.asRelativePath(doc.uri);
        const ext = path.extname(filePath).slice(1) || 'plaintext';
        const content = doc.getText();
        const lineCount = doc.lineCount;
        const block = `\n\n> 📄 **当前活动文件: \`${filePath}\`** (${lineCount} 行)\n\`\`\`${ext}\n${content}\n\`\`\`\n`;
        result = result.replace(/@active/g, block);
      } else {
        result = result.replace(/@active/g, '\n\n> ⚠️ 当前没有打开的文件\n');
      }
    }

    return result;
  }


  /**
   * Accumulate token usage from API response, send to webview.
   * Records a usage snapshot (for reserve window calculation) and
   * triggers auto-compact when the current response's total_tokens exceeds threshold.
   */
  private _accumulateAndSendUsage(
    usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number } | undefined,
    hasPendingToolCalls = false
  ): void {
    if (!usage) return;
    this._accumulatedUsage.prompt_tokens += usage.prompt_tokens;
    this._accumulatedUsage.completion_tokens += usage.completion_tokens;
    this._accumulatedUsage.total_tokens += usage.total_tokens;
    this._context.post({
      type: 'tokenUsage',
      usage,
      accumulated: { ...this._accumulatedUsage },
      compactThreshold: AUTO_COMPACT_TOKEN_THRESHOLD,
    });

    // Per-session token usage: remember this conversation's current context length.
    this._context.setCurrentSessionTokenContext(usage.prompt_tokens);

    // Record a snapshot using the API's accurate prompt_tokens for this call.
    // This is used by compactHistory to determine the 20k-token reserve window.
    this._context.addUsageSnapshot(usage.prompt_tokens);

    // Auto-compact when the current response's total_tokens exceeds threshold.
    // usage.total_tokens is the exact token count for this request (prompt + completion),
    // which directly reflects the current conversation context size.
    // Skip if there are pending tool_calls not yet responded to:
    // otherwise the fire-and-forget compact may run between the assistant(tool_calls)
    // message being added and its tool results being added, creating orphaned
    // tool messages that cause API 400 "role 'tool' must follow tool_calls".
    // Auto-compact only in free mode — sub-agents (executor/evaluator) must not
    // trigger global compaction, which would cut across agent boundaries.
    if (
      this._currentTag === 'free' &&
      !hasPendingToolCalls &&
      usage.total_tokens >= AUTO_COMPACT_TOKEN_THRESHOLD
    ) {
      this._context.compactHistory(true).catch(() => {});
    }
  }
  /**
   * L2 harness check: 返回本轮已修改但尚未登记于 `.OpenVibe/memory/L2-inventory.md`
   * 的文件（排除 memory 自身文件，防止同步自身触发「需要同步」的死循环）。
   * 以代码级信号驱动 memory 更新，而非依赖 LLM 对 prompt 的自觉遵守。
   * 知识库尚未 bootstrap（无 L2 文件）时返回空数组，交由主流程在 free 阶段处理。
   */
  private _pendingL2SyncFiles(): string[] {
    try {
      const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!root) return [];
      const edited = this._context.getSessionEditedFiles();
      if (edited.length === 0) return [];
      // 豁免 memory 自身文件（防死循环）
      const pending = edited.filter(
        (f) => !f.includes('.OpenVibe/memory/') && f !== '.OpenVibe/memory.md'
      );
      if (pending.length === 0) return [];

      const l2Path = path.join(root, '.OpenVibe', 'memory', 'L2-inventory.md');
      if (!fs.existsSync(l2Path)) return [];

      const l2 = fs.readFileSync(l2Path, 'utf-8');
      const l2Lines = l2.split('\n').map((l) => l.trim()).filter(Boolean);
      return pending.filter((f) => {
        const base = path.basename(f);
        return !l2.includes(f) && !l2Lines.some((l) => l.includes(base));
      });
    } catch {
      return [];
    }
  }


}