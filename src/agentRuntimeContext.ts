import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';

export type DefaultLineEnding = 'CRLF' | 'LF';

/**
 * Get information about the user's currently active editor (open file).
 * Returns a formatted section to inject into the agent prompt, or empty string
 * if no editor is active or no file is open.
 */
function getActiveEditorInfo(): string {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return '';
  }

  const doc = editor.document;
  if (doc.uri.scheme !== 'file') {
    // Only track actual file editors (not output, terminal, etc.)
    return '';
  }

  const filePath = vscode.workspace.asRelativePath(doc.uri);
  const language = doc.languageId;
  const cursorLine = editor.selection.active.line + 1;
  const cursorColumn = editor.selection.active.character + 1;
  const hasSelection = !editor.selection.isEmpty;
  const lineCount = doc.lineCount;

  let info = `- **Active editor**: \`${filePath}\` (${language})`;
  info += ` — cursor at line ${cursorLine}, column ${cursorColumn}`;
  info += `, ${lineCount} lines total`;
  if (hasSelection) {
    const selStart = editor.selection.start.line + 1;
    const selEnd = editor.selection.end.line + 1;
    info += `, selection from line ${selStart} to line ${selEnd}`;
  }
  info += '\n';

  return info;
}

/**
 * Short block appended to agent system prompts (main assistant, reviewers, compact, etc.).
 * Keeps models aware of Windows vs Unix paths, shells, and line-ending behavior,
 * as well as the currently active editor file.
 */
export function getAgentRuntimeContextBlock(): string {
  const plat = process.platform;
  const isWin = plat === 'win32';
  const lineEndingHint = isWin
    ? 'Tools create **new** workspace files with CRLF by default; **existing** files keep their detected line-ending style (CRLF or LF).'
    : 'Tools create **new** workspace files with LF by default; **existing** files keep their detected line-ending style.';
  const shellHint = isWin
    ? 'Terminal commands run via Node `exec` with the default Windows shell (often `cmd.exe`). Use syntax valid there, or wrap with `powershell -Command "..."` when you need PowerShell.'
    : 'Terminal commands run in a POSIX-style shell environment (typical `/bin/sh` semantics).';

  const activeEditorInfo = getActiveEditorInfo();

  let block =
    `## Host environment (OpenVibe)\n` +
    `- **OS**: ${os.type()} — platform \`${plat}\`, ${os.arch()}, release ${os.release()}\n` +
    `- **Paths**: separator \`${path.sep}\`; prefer workspace-relative paths with forward slashes in tool arguments (e.g. \`src/index.ts\`) — they resolve correctly on all platforms.\n` +
    `- **Line endings**: ${lineEndingHint}\n` +
    `- **Shell**: ${shellHint}\n`;

  if (activeEditorInfo) {
    block += `\n## Active Editor (实时追踪)\n${activeEditorInfo}`;
  }

  return block;
}

/** Structured snapshot for tool results (e.g. get_workspace_info). */
export function getRuntimeEnvironmentSummary(): {
  osPlatform: string;
  osType: string;
  osRelease: string;
  arch: string;
  pathSeparator: string;
  defaultNewFileLineEndings: DefaultLineEnding;
} {
  return {
    osPlatform: process.platform,
    osType: os.type(),
    osRelease: os.release(),
    arch: os.arch(),
    pathSeparator: path.sep,
    defaultNewFileLineEndings: process.platform === 'win32' ? 'CRLF' : 'LF',
  };
}
