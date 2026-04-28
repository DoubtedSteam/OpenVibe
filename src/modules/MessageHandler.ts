import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { ChatMessage, ApiConfig } from '../types';
import { getAgentRuntimeContextBlock } from '../agentRuntimeContext';
import { SYSTEM_PROMPT, TOOL_DEFINITIONS } from '../toolDefinitions';
import { sendChatMessage } from '../api';
import { gitSnapshotTool } from '../tools';
import { AUTO_COMPACT_TOKEN_THRESHOLD, MAX_TOOL_ITERATIONS } from '../constants';
import { extractXmlPlaceholders, applyXmlPlaceholders } from '../mmOutput';
import type { OperationController } from '../operationController';

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
      // Internal-only prompt injection for the next LLM call.
      // Used to nudge the model when it returns plain text without tool calls (it should either call tools or task_complete).
      // IMPORTANT: Do not append this as a visible chat message.
      let injectedSystemPrompt = '';

      // If a todo list is active, remind the LLM that it may need to update it
      // when the user's new message changes requirements. Not visible to the user.
      const todoInfo = this._context.getTodoControlInfo();
      if (todoInfo && todoInfo.remaining > 0) {
        injectedSystemPrompt = '\n\n[INTERNAL NUDGE]\n如有需要，请变更todo list。\n[END INTERNAL NUDGE]\n';
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

        const allMessages = this._context.buildMessagesForLlm(SYSTEM_PROMPT + `

` + getAgentRuntimeContextBlock() + langInstr + injectedSystemPrompt);

        const response = await sendChatMessage(allMessages, apiConfig, TOOL_DEFINITIONS, this._context.operation.signal());
        // Accumulate and report token usage after every LLM call
        this._accumulateAndSendUsage(response.tokenUsage);



        // Check for stop request before processing response
        if (this._context.operation.isStopped()) {
          this._context.post({ type: 'info', message: 'Operation stopped by user.' });
          break;
        }

        if (response.toolCalls && response.toolCalls.length > 0) {
          // Reset any internal nudge once the model starts using tools again.
          injectedSystemPrompt = '';
          // Push assistant turn (may have reasoning text + tool_calls)
          this._context.addMessage({
            role: 'assistant',
            content: response.content,
            reasoning_content: response.reasoningContent,
            tool_calls: response.toolCalls,
          });

          // Show any reasoning text the model produced alongside the tool calls
          if (response.content) {
            this._context.post({ type: 'addMessage', message: { role: 'assistant', content: response.content } });
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

            // ── XML content fallback ───────────────────────────────────────────
            // Before JSON.parse, scan for <edit-content>/<shell-content> tags
            // embedded in newContent / command JSON string values.  The tagged
            // payload is extracted, decoded (JSON-unescaped), and replaced with a
            // safe placeholder.  After parse, placeholders are swapped back to
            // the decoded raw text — the tagged content never goes through JSON
            // escaping.
            const { sanitizedArgs, placeholderMap } = extractXmlPlaceholders(rawArgs);
            let args: Record<string, unknown> = {};
            try { args = JSON.parse(sanitizedArgs); } catch { /* keep empty */ }
            applyXmlPlaceholders(args, placeholderMap);




            // task_complete：提示 AI 更新 .OpenVibe/memory.md 后结束
            if (name === 'task_complete') {
              const memoryHint = 'Task complete. Remember to update .OpenVibe/memory.md if you modified any files during this task — update Level 3/4 per-file immediately, then Level 1 after all files are done.';
              const result = JSON.stringify({ success: true, operation: 'task_complete', message: 'Task marked complete. ' + memoryHint });
              this._context.post({ type: 'toolResult', name, result });
              this._context.addMessage({ role: 'tool', content: result, tool_call_id: toolCall.id });
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
            injectedSystemPrompt = '';
            break;
          }
          // Go back to the top of the loop to continue the conversation
        } else {
          // Text response (no tool calls)
          let content = response.content ?? '(no response)';

          this._context.addMessage({ role: 'assistant', content, reasoning_content: response.reasoningContent });
          this._context.post({ type: 'addMessage', message: { role: 'assistant', content } });

          const todo = this._context.getTodoControlInfo();
          if (!todo) {
            // No todo list: plain text response means we're done.
            injectedSystemPrompt = '';
            break;
          }

          if (todo.remaining <= 0) {
            // Todo list exists but nothing remains: allow plain text to end.
            injectedSystemPrompt = '';
            break;
          }

          // Todo list exists and has remaining work: remind LLM to continue and use tools.
          // Nudge the LLM internally (do NOT show in chatbot, do NOT store in session history).
          injectedSystemPrompt =
            `\n\n[INTERNAL NUDGE]\n` +
            `你当前有一个todo list，仍有未完成的步骤（Remaining: ${todo.remaining}）。\n` +
            `**Goal**: ${todo.goal}\n` +
            `**Items**:\n${todo.list}\n\n` +
            `请继续完成剩余步骤：必要时发起tool calls，并在完成某一步后调用complete_todo_item。\n` +
            `当所有步骤完成且任务整体完成后，再调用task_complete（可选带summary）结束。\n` +
            `[END INTERNAL NUDGE]\n`;
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
        return `

## Language Instruction
请使用简体中文回复用户。所有工具调用的说明和输出、错误处理、修改总结等都请使用中文。`;
      case 'en':
        return '';
      default:
        // Fallback: auto-detected but unknown — stay neutral
        return '';
    }
  }

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