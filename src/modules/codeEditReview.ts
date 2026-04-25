import * as vscode from 'vscode';
import { sendChatMessage } from '../api';
import type { ApiConfig, ChatMessage, AgentLogEntry } from '../types';
import type { ReplaceCheckContext, ReplaceCheckResult } from '../tools';

/** Avoid oversized webview payloads; mirror UIManager behavior. */
const MAX_CONTEXT_CHARS = 120_000;

function languageIdFromPath(filePath: string): string {
  const i = filePath.lastIndexOf('.');
  const ext = i >= 0 ? filePath.slice(i + 1).toLowerCase() : '';
  const map: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    mts: 'typescript',
    cts: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    mjs: 'javascript',
    cjs: 'javascript',
    json: 'json',
    md: 'markdown',
    py: 'python',
    rs: 'rust',
    go: 'go',
    css: 'css',
    scss: 'scss',
    less: 'less',
    html: 'html',
    yml: 'yaml',
    yaml: 'yaml',
    sh: 'shellscript',
    ps1: 'powershell',
    cs: 'csharp',
    cpp: 'cpp',
    cc: 'cpp',
    cxx: 'cpp',
    h: 'cpp',
    c: 'c',
  };
  return map[ext] || 'plaintext';
}

function trimForWebview(s: string): { text: string; truncated: boolean } {
  if (s.length <= MAX_CONTEXT_CHARS) {
    return { text: s, truncated: false };
  }
  return { text: s.slice(0, MAX_CONTEXT_CHARS) + '\n\n… [truncated for chat view]', truncated: true };
}

function readEditReviewSettings(): { enabled: boolean; timeoutMs: number } {
  const c = vscode.workspace.getConfiguration('vibe-coding');
  return {
    enabled: c.get<boolean>('editReview.enabled', true) !== false,
    timeoutMs: Math.max(5000, c.get<number>('editReview.timeoutMs', 120000)),
  };
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

function parseIndependentReview(content: string | null): { ok: boolean; reason: string; notes: string[] } {
  if (!content?.trim()) {
    return { ok: false, reason: 'Empty review response', notes: ['Review agent returned empty content.'] };
  }
  try {
    const raw = extractJsonObject(content) as Record<string, unknown>;
    const decision = String(raw.decision || '').toUpperCase();
    const ok = decision === 'CONFIRM';
    const reason = typeof raw.reason === 'string' ? raw.reason : '';
    const notes = Array.isArray(raw.notes) ? raw.notes.map((x) => String(x)) : [];
    return { ok, reason: reason || (ok ? 'OK' : 'Rejected'), notes };
  } catch {
    return { ok: false, reason: 'Invalid review JSON', notes: ['Review agent output was not valid JSON.'] };
  }
}

const REVIEW_SYSTEM = `You are an independent review agent for a SINGLE code edit about to be applied in a VS Code workspace.
You MUST NOT modify any files. You only output JSON.

Your ONLY job is to check whether this specific code edit (BEFORE → AFTER) is syntactically valid and structurally sound.
- Verify that the replacement code is syntactically valid (no syntax errors).
- Verify that the replacement maintains structural integrity (e.g., brackets match, indentation is preserved).
- Do NOT check for semantic correctness, logical consistency, or undefined variables — those are outside your scope.
- Do NOT reject for stylistic preferences, minor formatting differences, or hypothetical edge cases.

Output exactly one JSON object:
{"decision":"CONFIRM"|"REJECT","reason":"one short sentence explaining the verdict","notes":["string", ...]}`;

export async function llmIndependentEditReview(params: {
  ctx: ReplaceCheckContext;
  apiConfig: ApiConfig;
  post: (msg: any) => void;
  /** 1-based index of this Replace check in the current user instruction (shown on the card). */
  reviewRound?: number;
  signal?: AbortSignal;
  log?: (e: AgentLogEntry) => void;
}): Promise<ReplaceCheckResult> {
  const settings = readEditReviewSettings();
  if (!settings.enabled) {
    // fall back to legacy UIManager check by returning ok and letting UIManager handle display upstream
    return { ok: true, reason: 'Independent edit review disabled', notes: [] };
  }

  const userMsg =
    `## Edit being reviewed
File: ${params.ctx.filePath} | lines ${params.ctx.startLine}–${params.ctx.endLine}

` +
    `#### BEFORE
\`\`\`
${params.ctx.beforeContext}
\`\`\`

` +
    `#### AFTER
\`\`\`
${params.ctx.afterContext}
\`\`\`
`;

  let content: string | null = null;
  try {
    const messages: ChatMessage[] = [
      { role: 'system', content: REVIEW_SYSTEM },
      { role: 'user', content: userMsg },
    ];
    try {
      const messagesLogSummary = messages.map((m) => ({
        role: m.role,
        contentChars: typeof m.content === 'string' ? m.content.length : 0,
        toolCalls: Array.isArray(m.tool_calls) ? m.tool_calls.length : 0,
      }));
      // Do not log full message bodies (can be huge and block session persistence).
      params.log?.({
        at: Date.now(),
        agent: 'codeEditReview',
        stage: 'request',
        data: { messageCount: messages.length, messages: messagesLogSummary },
      });
    } catch {
      /* ignore */
    }
    const res = await sendChatMessage(messages, params.apiConfig, undefined, params.signal, {
      timeoutMs: settings.timeoutMs,
    });
    content = res.content;
    try {
      params.log?.({ at: Date.now(), agent: 'codeEditReview', stage: 'response', data: { content } });
    } catch {
      /* ignore */
    }
  } catch {
    try {
      params.log?.({ at: Date.now(), agent: 'codeEditReview', stage: 'error', data: { error: 'request failed' } });
    } catch {
      /* ignore */
    }
    content = null;
  }

  const parsed = parseIndependentReview(content);

  // Surface verdict in UI as a check card (same shape as UIManager.llmCheckReplace).
  const reason = parsed.reason || '(no reason given)';
  const unifiedT = trimForWebview(params.ctx.unifiedDiff || '');
  params.post({
    type: 'addCheckCard',
    data: {
      filePath: params.ctx.filePath,
      startLine: params.ctx.startLine,
      endLine: params.ctx.endLine,
      verdict: parsed.ok ? 'CONFIRMED' : 'REJECTED',
      reason,
      timestamp: Date.now(),
      unifiedDiff: unifiedT.text,
      contextTruncated: unifiedT.truncated,
      languageId: languageIdFromPath(params.ctx.filePath),
      reviewRound: params.reviewRound,
    },
  });

  return { ok: parsed.ok, reason, notes: parsed.notes };
}

