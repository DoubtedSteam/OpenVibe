import type { ChatMessage } from '../types';

/** Strip <edit-content> tags from content for display safety. */
function stripTags(text: string): string {
  let cleaned = text.replace(/<edit-content>[\s\S]*?<\/edit-content>/gi, '').trim();
  // Clean up empty code fences that may result from tag stripping
  cleaned = cleaned.replace(/```\s*```/g, '');
  return cleaned;
}

/** Strip the ─── Context ─── block (runtime LLM metadata) from user messages. */
function stripContextBlock(text: string): string {
  return text.replace(/─── Context ───\n[\s\S]*?\n────────────────\n\n/, '');
}

/**
 * Replays persisted messages to the webview (bubbles + tool cards).
 * Strips any remaining <edit-content> tags from stored content as a safety net.
 */
export function replaySessionToWebview(messages: ChatMessage[], post: (msg: any) => void): void {
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
