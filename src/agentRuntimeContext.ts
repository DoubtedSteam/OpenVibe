import * as os from 'os';
import * as path from 'path';

export type DefaultLineEnding = 'CRLF' | 'LF';

/**
 * Short block appended to agent system prompts (main assistant, reviewers, compact, etc.).
 * Keeps models aware of Windows vs Unix paths, shells, and line-ending behavior.
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

  return (
    `## Host environment (OpenVibe)\n` +
    `- **OS**: ${os.type()} — platform \`${plat}\`, ${os.arch()}, release ${os.release()}\n` +
    `- **Paths**: separator \`${path.sep}\`; prefer workspace-relative paths with forward slashes in tool arguments (e.g. \`src/index.ts\`) — they resolve correctly on all platforms.\n` +
    `- **Line endings**: ${lineEndingHint}\n` +
    `- **Shell**: ${shellHint}\n`
  );
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
