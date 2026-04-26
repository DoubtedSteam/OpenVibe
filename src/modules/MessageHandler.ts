import { ChatMessage, ApiConfig } from '../types';
import { getAgentRuntimeContextBlock } from '../agentRuntimeContext';
import { SYSTEM_PROMPT, TOOL_DEFINITIONS } from '../toolDefinitions';
import { sendChatMessage } from '../api';
import { gitSnapshotTool } from '../tools';
import { AUTO_COMPACT_TOKEN_THRESHOLD, MAX_TOOL_ITERATIONS } from '../constants';
import { extractXmlContents } from '../mmOutput';
import type { OperationController } from '../operationController';

export class MessageHandler {
  private _isRunning = false;

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

          // Execute each tool call sequentially
          let stopAfterTools = false;
          // Extract <edit-content>/<shell-content> from visible content as a fallback
          // source for large string parameters (avoids JSON escaping issues).
          const xmlItems = extractXmlContents(response.content);
          let xmlIndex = 0;
          for (const toolCall of response.toolCalls) {
            // Check for stop request before each tool call
            if (this._context.operation.isStopped()) {
              this._context.post({ type: 'info', message: 'Operation stopped by user.' });
              break;
            }

             const name = toolCall.function.name;
            let args: Record<string, unknown> = {};
            try { args = JSON.parse(toolCall.function.arguments); } catch { /* keep empty */ }


            // XML content fallback (edit + run_shell_command):
            // If newContent/command in JSON is empty, try to fill from matching XML tags
            // in document order. This avoids JSON string escaping issues for large text payloads.
            if (xmlIndex < xmlItems.length) {
              if (name === 'edit') {
                const cur = typeof args['newContent'] === 'string' ? String(args['newContent']) : '';
                if (!cur && xmlItems[xmlIndex].type === 'edit') {
                  args['newContent'] = xmlItems[xmlIndex].payload;
                  xmlIndex++;
                } else if (!cur && xmlItems[xmlIndex].type === 'shell') {
                  this._context.post({ type: 'info', message: 'XML fallback: edit expects <edit-content> but next tag is <shell-content>. Tag skipped.' });
                }
              } else if (name === 'run_shell_command') {
                const cur = typeof args['command'] === 'string' ? String(args['command']) : '';
                if (!cur.trim() && xmlItems[xmlIndex].type === 'shell') {
                  args['command'] = xmlItems[xmlIndex].payload;
                  xmlIndex++;
                } else if (!cur.trim() && xmlItems[xmlIndex].type === 'edit') {
                  this._context.post({ type: 'info', message: 'XML fallback: shell expects <shell-content> but next tag is <edit-content>. Tag skipped.' });
                }
              }
            } else {
              // Diagnostic: tool needs XML fallback but no matching tag found.
              if (name === 'edit') {
                const cur = typeof args['newContent'] === 'string' ? String(args['newContent']) : '';
                if (!cur) {
                  this._context.post({ type: 'info', message: 'XML fallback: edit tool has empty newContent but no <edit-content> tag found in response content. Ensure tags are in visible text output.' });
                }
              } else if (name === 'run_shell_command') {
                const cur = typeof args['command'] === 'string' ? String(args['command']) : '';
                if (!cur.trim()) {
                  this._context.post({ type: 'info', message: 'XML fallback: shell tool has empty command but no <shell-content> tag found in response content. Ensure tags are in visible text output.' });
                }
              }
            }


            // task_complete：do not emit extra assistant text; still MUST respond with a tool message.
            if (name === 'task_complete') {
              const result = JSON.stringify({ success: true, operation: 'task_complete' });
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
              } else {
                result = await this._context.executeTool(name, args);
              }
            } catch (e: any) {
              result = JSON.stringify({ error: e.message });
            }

            this._context.post({ type: 'toolResult', name, result });
            if (name !== 'compact') {
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
          if (response.tokenUsage) {
            this._context.post({ type: 'tokenUsage', usage: response.tokenUsage });
            // 自动 compact：prompt_tokens 超过阈值时在本轮结束后压缩历史
            if (response.tokenUsage.prompt_tokens >= AUTO_COMPACT_TOKEN_THRESHOLD) {
              await this._context.compactHistory(true);
            }
          }

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
}