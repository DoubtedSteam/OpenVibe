import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { ChatMessage, ApiConfig } from '../types';
import { getAgentRuntimeContextBlock } from '../agentRuntimeContext';
import { SYSTEM_PROMPT } from '../systemPrompt';
import { TOOL_DEFINITIONS } from '../toolDefinitions';
import { sendChatMessage } from '../api';
import { gitSnapshotTool } from '../tools';
import { AUTO_COMPACT_TOKEN_THRESHOLD, MAX_TOOL_ITERATIONS } from '../constants';
import type { OperationController } from '../operationController';
import { extractXmlPlaceholders, applyXmlPlaceholders } from '../mmOutput';

export class MessageHandler {
  private _isRunning = false;
  /** Cumulative token usage across all LLM calls in this session. */
  private _accumulatedUsage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

  constructor(
    private readonly _context: {
      getApiConfig: () => ApiConfig;
      post: (message: any) => void;
      /** Assembled system + history; extension point for multi-agent. */
      buildMessagesForLlm: (systemPrompt: string) => ChatMessage[];
      addMessage: (message: ChatMessage) => void;
      getCurrentSessionId: () => string;
      saveCurrentSession: () => void;
      sanitizeIncompleteToolCalls: () => void;
      executeTool: (name: string, args: Record<string, unknown>) => Promise<string>;
      getTodoControlInfo: () => { goal: string; list: string; remaining: number } | null;
      getSessionEditedFiles: () => string[];
      getEditPermissionEnabled: () => boolean;
      compactHistory: (triggeredByTokenLimit?: boolean) => Promise<string>;
      /** Reset per-turn UI counters (e.g. edit review #) when the user sends a new instruction. */
      onUserInstructionStart?: () => void;
      /** Shared operation controller used across main + sub agents. */
      /** Shared operation controller used across main + sub agents. */
      operation: OperationController;
      /** Side-effects to run on stop (e.g. resolve confirm bars). */
      onStopSideEffects?: () => void;
      /** Fire-and-forget: auto-name the session after the first user message. */
      autoNameSession?: () => void;
    }
  ) {}

  public async handleUserMessage(text: string): Promise<void> {
    if (this._isRunning) { return; }

    this._context.sanitizeIncompleteToolCalls();

    this._isRunning = true;
    this._context.operation.reset();
    this._context.post({ type: 'setRunning', running: true });

    // /compact 命令直接触发压缩，不进入 LLM 循环
    if (text.trim() === '/compact') {
      try {
        const result = await this._context.compactHistory(false);
        const parsed = JSON.parse(result);
        if (parsed.success) {
          this._context.post({ type: 'info', message: `🗜️ 对话历史已压缩：归档 ${parsed.archived} 条消息，保留 ${parsed.preserved} 条。` });
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
      
      this._context.post({ type: 'addMessage', message: { role: 'user', content: text } });
      this._context.addMessage({ role: 'user', content: text });
      // Fire-and-forget: auto-name the session from the first user message.
      this._context.autoNameSession?.();
    } else {
      // 空消息：添加占位消息，让LLM知道用户想继续
      const placeholder = "[继续]";
      this._context.post({ type: 'addMessage', message: { role: 'user', content: placeholder } });
      this._context.addMessage({ role: 'user', content: placeholder });
    }
    
    this._context.post({ type: 'loading', loading: true });
    
    try {
      const apiConfig = this._context.getApiConfig();
      let iterations = 0;
      const maxIterations = apiConfig.maxInteractions === -1 ? Number.MAX_SAFE_INTEGER : (apiConfig.maxInteractions || MAX_TOOL_ITERATIONS);
      // Internal-only nudge for the next LLM call.
      // Used to remind the model to update the todo list.
      // Placed as a separate system message (not in system prompt) to preserve prompt-cache prefix.
      // IMPORTANT: Do not append this as a visible chat message.
      let pendingNudge = '';

      // If a todo list is active, remind the LLM that it may need to update it
      // when the user's new message changes requirements. Not visible to the user.
      const todoInfo = this._context.getTodoControlInfo();
      if (todoInfo && todoInfo.remaining > 0) {
        pendingNudge = '\n\n[INTERNAL NUDGE]\n如有需要，请变更todo list。\n[END INTERNAL NUDGE]\n';
      }
      
      while (iterations < maxIterations && !this._context.operation.isStopped()) {
        iterations++;

        // Check if user requested stop before each iteration
        if (this._context.operation.isStopped()) {
          this._context.post({ type: 'info', message: 'Operation stopped by user.' });
          break;
        }
        // Build language instruction based on user's setting
        const langInstr = this._buildLanguageInstruction(apiConfig.language);

        const allMessages = this._context.buildMessagesForLlm(SYSTEM_PROMPT + '\n\n\n' + getAgentRuntimeContextBlock() + langInstr);
        // Append runtime state AFTER conversation history so the prefix ([0] system + history) stays cacheable.
        allMessages.push({ role: 'system', content: this._buildEditPermissionBlock() });
        if (pendingNudge) {
          allMessages.push({ role: 'system', content: pendingNudge });
        }

        const response = await sendChatMessage(allMessages, apiConfig, TOOL_DEFINITIONS, this._context.operation.signal());
        // Accumulate and report token usage after every LLM call
        this._accumulateAndSendUsage(response.tokenUsage);



        // Check for stop request before processing response
        if (this._context.operation.isStopped()) {
          this._context.post({ type: 'info', message: 'Operation stopped by user.' });
          break;
        }

        if (response.toolCalls && response.toolCalls.length > 0) {
          // Nudge is consumed once the model starts using tools; system prompt stays stable for cache.
          pendingNudge = '';
          // ── Extract <edit-content> blocks from visible response ──────────
          // The AI can place raw multi-line content inside <edit-content> tags
          // in the visible response instead of JSON-escaping it in newContent.
          // These blocks are extracted here, filtered from UI display,
          // and injected into corresponding tool calls with empty newContent.
          const editContentBlocks: string[] = [];
          let displayContent = response.content || '';
          if (response.content) {
            const tagRe = /<edit-content>([\s\S]*?)<\/edit-content>/gi;
            let match: RegExpExecArray | null;
            while ((match = tagRe.exec(response.content)) !== null) {
              editContentBlocks.push(match[1]);
            }
            if (editContentBlocks.length > 0) {
              displayContent = response.content.replace(tagRe, '').trim();
              // Clean up empty code fences that may result from tag stripping
              // (prevents rendering as empty black-background <pre> boxes in the webview)
              displayContent = displayContent.replace(/```\s*```/g, '');
            }
          }

          // Push assistant turn with filtered content (no <edit-content> blocks)
          // Push assistant turn with filtered content (tags stripped)
          this._context.addMessage({
            role: 'assistant',
            content: displayContent,
            reasoning_content: response.reasoningContent,
            tool_calls: response.toolCalls,
          });

          // Show assistant text with <edit-content> blocks filtered out
          if (displayContent) {
            this._context.post({ type: 'addMessage', message: { role: 'assistant', content: displayContent } });
          }


          let stopAfterTools = false;
          for (const toolCall of response.toolCalls) {
            // Check for stop request before each tool call
            if (this._context.operation.isStopped()) {
              this._context.post({ type: 'info', message: 'Operation stopped by user.' });
              break;
            }

            const name = toolCall.function.name;
            const rawArgs = toolCall.function.arguments;

            // Parse arguments and inject <edit-content> blocks into empty newContent
            const { sanitizedArgs, placeholderMap } = extractXmlPlaceholders(rawArgs);
            let args: Record<string, unknown> = {};
            try { args = JSON.parse(sanitizedArgs); } catch { try { args = JSON.parse(rawArgs); } catch { /* keep empty */ } }
            if (placeholderMap.size > 0) { applyXmlPlaceholders(args, placeholderMap); }
            if (editContentBlocks.length > 0 &&
                (name === 'edit' || name === 'run_shell_command')) {
              if (name === 'edit' && (!args['newContent'] || args['newContent'] === '')) {
                args['newContent'] = editContentBlocks.shift()!;
              } else if (name === 'run_shell_command' && (!args['command'] || args['command'] === '')) {
                args['command'] = editContentBlocks.shift()!;
              }
            }




            // task_complete：提示 AI 更新 .OpenVibe/memory.md 后结束
            if (name === 'task_complete') {
              // ── 获取本次任务修改的文件列表 ──────────────────────────────
              const modifiedFiles = this._context.getSessionEditedFiles();
              const fileListStr = modifiedFiles.length > 0
                ? modifiedFiles.map(f => `- \`${f}\``).join('\n')
                : '(无文件修改)';
              const fileSummary = modifiedFiles.length > 0
                ? `\n\n**📄 本次修改了 ${modifiedFiles.length} 个文件**:\n${fileListStr}`
                : '';

              const memoryHint = 'Task complete. Remember to update .OpenVibe/memory.md if you modified any files during this task — update Level 3/4 per-file immediately, then Level 1 after all files are done.';
              const summary = (args['summary'] as string) || '';
              const result = JSON.stringify({
                success: true,
                operation: 'task_complete',
                message: 'Task marked complete. ' + memoryHint,
                summary,
                modifiedFiles,
              });
              this._context.post({ type: 'toolResult', name, result });
              this._context.addMessage({ role: 'tool', content: result, tool_call_id: toolCall.id });

              // ── 在聊天中显示修改文件列表（hiddenFromLlm 不占用 LLM 上下文）────
              const displayContent = `✅ **任务完成**${summary ? ': ' + summary : ''}${fileSummary}`;
              this._context.post({ type: 'addMessage', message: { role: 'assistant', content: displayContent } });
              this._context.addMessage({ role: 'assistant', content: displayContent, hiddenFromLlm: true });

              stopAfterTools = true;
              break;
            }

            // 其他工具正常处理
            this._context.post({ type: 'toolCall', name, args });

            let result: string;
            try {
              if (name === 'compact') {
                result = await this._context.compactHistory(false);
                // After user-initiated compact, stop the tool loop and wait for user input.
                // compactHistory already updated the UI (clearMessages + addMessage summary).
                stopAfterTools = true;
                break;
              } else {
                result = await this._context.executeTool(name, args);
              }
            } catch (e: any) {
              result = JSON.stringify({ error: e.message });
            }

            // compact's tool result should NOT be posted (compactHistory already replaced the UI)
            if (name !== 'compact') {
              this._context.post({ type: 'toolResult', name, result });
              this._context.addMessage({ role: 'tool', content: result, tool_call_id: toolCall.id });
            }
          } // End of for (const toolCall of response.toolCalls)
          if (stopAfterTools) {
            pendingNudge = '';
            break;
          }
          // Go back to the top of the loop to continue the conversation
        } else {
          // Text response (no tool calls)
          let content = response.content ?? '(no response)';

          this._context.addMessage({ role: 'assistant', content, reasoning_content: response.reasoningContent });
          this._context.post({ type: 'addMessage', message: { role: 'assistant', content } });

          // Plan A: 模型输出纯文本（无 tool_calls）时始终结束循环，
          // 把控制权交还给用户。模型主动选择输出文本而不是调用工具，
          // 说明它在等待用户的下一步指示——无论 todo list 是否还有未完成项。
          // 用户可以通过发送新消息来继续未完成的工作。
          pendingNudge = '';
          break;
        }
        
        if (iterations >= maxIterations) {
          this._context.post({ type: 'info', message: `Iteration limit (${maxIterations}) reached. Send an empty message to keep going, or type a new instruction.` });
        }
      } // end while
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

  public stopCurrentOperation(): void {
    if (this._isRunning) {
      this._context.onStopSideEffects?.();
      this._context.operation.stop();
      this._context.post({ type: 'info', message: 'Stopping current operation...' });
    }
  }
  /**
   * Build a language instruction block appended to the system prompt.
   * Tells the AI to respond in the user's preferred language.
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

  /** Build the Edit Permission status block reflecting the current toggle state. */
  private _buildEditPermissionBlock(): string {
    const enabled = this._context.getEditPermissionEnabled();
    const icon = enabled ? '🔓' : '🔒';
    const label = enabled ? 'ON (write tools available)' : 'OFF (read-only tools only)';
    return `## Edit Permission\n${icon} **${label}**`;
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
   * Accumulate token usage and send to webview.
   * Also triggers auto-compact when prompt tokens exceed threshold.
   */
  private _accumulateAndSendUsage(usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number } | undefined): void {
    if (!usage) return;
    this._accumulatedUsage.prompt_tokens += usage.prompt_tokens;
    this._accumulatedUsage.completion_tokens += usage.completion_tokens;
    this._accumulatedUsage.total_tokens += usage.total_tokens;
    this._context.post({
      type: 'tokenUsage',
      usage,
      accumulated: { ...this._accumulatedUsage },
    });
    // Auto-compact when prompt_tokens exceed threshold
    if (usage.prompt_tokens >= AUTO_COMPACT_TOKEN_THRESHOLD) {
      // Fire-and-forget compact
      this._context.compactHistory(true).catch(() => {});
    }
  }


}