import { getAgentRuntimeContextBlock } from '../agentRuntimeContext';
import { sendChatMessage } from '../api';
import type { ApiConfig, ChatMessage, AgentLogEntry } from '../types';

export interface ShellCommandReviewSettings {
  enabled: boolean;
  reviewTimeoutMs: number;
}

export type ShellReviewDecision = 'PASS' | 'FAIL';

export interface ShellReviewAgentResult {
  decision: ShellReviewDecision;
  notes: string[];
  summary: string;
}

function extractJsonObject(text: string): unknown {
  const t = text.trim();
  try {
    return JSON.parse(t);
  } catch {
    /* fall through */
  }
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start >= 0 && end > start) {
    return JSON.parse(t.slice(start, end + 1));
  }
  throw new Error('No JSON object in model output');
}

function parseShellReviewResult(content: string | null): ShellReviewAgentResult {
  if (!content?.trim()) {
    return {
      decision: 'FAIL',
      notes: ['Review agent returned empty content.'],
      summary: 'Empty review response',
    };
  }
  try {
    const raw = extractJsonObject(content) as Record<string, unknown>;
    const d = String(raw.decision || '').toUpperCase();
    const decision: ShellReviewDecision = d === 'PASS' ? 'PASS' : 'FAIL';
    let notes: string[] = [];
    if (Array.isArray(raw.notes)) {
      notes = raw.notes.map((x) => String(x));
    } else if (typeof raw.notes === 'string' && raw.notes.trim()) {
      notes = [raw.notes.trim()];
    }
    const summary = typeof raw.summary === 'string' ? raw.summary : '';
    if (notes.length === 0 && summary) {
      notes = [summary];
    }
    return { decision, notes, summary: summary || (decision === 'PASS' ? 'OK' : 'Issues found') };
  } catch {
    return {
      decision: 'FAIL',
      notes: ['Review agent output was not valid JSON; treating as FAIL.'],
      summary: 'Invalid review JSON',
    };
  }
}

async function chatJson(
  messages: ChatMessage[],
  apiConfig: ApiConfig,
  timeoutMs: number,
  signal?: AbortSignal,
  log?: (e: AgentLogEntry) => void,
  agent?: string
): Promise<string | null> {
  const messagesLogSummary = messages.map((m) => ({
    role: m.role,
    contentChars: typeof m.content === 'string' ? m.content.length : 0,
    toolCalls: Array.isArray(m.tool_calls) ? m.tool_calls.length : 0,
  }));
  try {
    // IMPORTANT: Do not log full message bodies here; they can be very large (memory/context)
    // and would bloat sessions/index.json and block the extension thread on sync persistence.
    log?.({
      at: Date.now(),
      agent: agent || 'agent',
      stage: 'request',
      data: { timeoutMs, messageCount: messages.length, messages: messagesLogSummary },
    });
  } catch {
    /* ignore */
  }
  const res = await sendChatMessage(messages, apiConfig, undefined, signal, { timeoutMs });
  try {
    log?.({ at: Date.now(), agent: agent || 'agent', stage: 'response', data: { content: res.content } });
  } catch {
    /* ignore */
  }
  return res.content;
}

const REVIEW_SYSTEM = `You are an independent review agent for run_shell_command (terminal command in the workspace).
You MUST NOT execute commands or modify files. Output JSON only.

Evaluate the proposed command:
1) **Safety**: obvious destructive risk (e.g. rm -rf on broad paths), arbitrary remote code execution, piping curl/wget to shell, disabling security, etc.
2) **Edit-tool bypass**: shell-based file edits to project source/config (sed/awk/perl one-liners, tee, redirection, PowerShell Set-Content/Out-File) when the task is ordinary code editing — those should use read_file + edit instead. Read-only git/status/log commands are usually fine.
3) **No-shell-for-code-context (CRITICAL)**: Reject commands whose purpose is to view/search/harvest **project source code** or broadly enumerate/search the workspace. The workspace provides dedicated tools for that.
   - Reject examples (code/context harvesting): cat/type/Get-Content on files under src/ or code extensions (.ts/.js/.py/...), dir /s, Get-ChildItem -Recurse, find/grep/rg/Select-String used to inspect project files.
   - Allow (read-only, narrow): viewing a **single non-code artifact** explicitly requested by the user (e.g. .log/.txt/.md) with a simple read-only command, no pipes, no recursion.
   - If the user needs code context, instruct them to use read_file / find_in_file instead (do NOT approve a shell workaround).

Output strictly one JSON object:
{"decision":"PASS"|"FAIL","notes":["string", ...],"summary":"one short sentence"}`;

/** Single-review pass for shell commands. */
export async function reviewShellCommand(params: {
  apiConfig: ApiConfig;
  command: string;
  recentShell: string;
  reviewTimeoutMs: number;
  signal?: AbortSignal;
  log?: (e: AgentLogEntry) => void;
}): Promise<ShellReviewAgentResult> {
  const userMsg =
    `## Proposed command\n${params.command}\n\n` +
    `${params.recentShell}\n`;

  const content = await chatJson(
    [
      { role: 'system', content: REVIEW_SYSTEM + '\n\n' + getAgentRuntimeContextBlock() },
      { role: 'user', content: userMsg },
    ],
    params.apiConfig,
    params.reviewTimeoutMs,
    params.signal,
    params.log,
    'shellReview'
  );
  return parseShellReviewResult(content);
}
