import { exec } from 'child_process';
import { promisify } from 'util';
import { getWorkspaceRoot } from '../utils/pathHelpers';

const execAsync = promisify(exec);

export interface RunShellCommandParams {
  command: string;
}

function summarizeShellOutput(stdout: string, stderr: string): {
  keyErrors: string[];
  summary: string;
} {
  const text = (stderr + '\n' + stdout).trim();
  const keyErrors: string[] = [];

  const tsRe = /(^|\r?\n)([^:\r\n]+\.ts):(\d+):(\d+)\s+-\s+error\s+(TS\d+):\s+([^\r\n]+)/g;
  let m: RegExpExecArray | null;
  while ((m = tsRe.exec(text)) !== null) {
    keyErrors.push((m[6] + ' ' + m[2] + ':' + m[3] + ':' + m[4] + ' ' + m[7]).trim());
    if (keyErrors.length >= 10) break;
  }

  if (keyErrors.length === 0) {
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    for (const line of lines) {
      if (/^(error|fatal|exception)\b/i.test(line) || /\berror\b/i.test(line)) {
        keyErrors.push(line.slice(0, 240));
        if (keyErrors.length >= 8) break;
      }
    }
  }

  const summary =
    keyErrors.length > 0
      ? keyErrors[0]
      : text
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean)[0]
          ?.slice(0, 240) || '';

  return { keyErrors, summary };
}

export async function runShellCommandTool(params: RunShellCommandParams): Promise<string> {
  try {
    const root = getWorkspaceRoot();
    const command = (params.command ?? '').trim();
    if (!command) {
      return JSON.stringify({ error: 'command is empty' });
    }
    const startedAt = Date.now();
    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: root,
        timeout: 120_000,
        maxBuffer: 2 * 1024 * 1024,
        windowsHide: true,
      });
      const out = stdout == null ? '' : String(stdout);
      const err = stderr == null ? '' : String(stderr);
      const durationMs = Date.now() - startedAt;
      const extracted = summarizeShellOutput(out, err);
      return JSON.stringify({
        success: true,
        command,
        cwd: root,
        exitCode: 0,
        durationMs,
        stdout: out.slice(0, 500_000),
        stderr: err.slice(0, 100_000),
        truncated: out.length > 500_000 || err.length > 100_000,
        keyErrors: extracted.keyErrors,
        summary: extracted.summary,
      });
    } catch (e: unknown) {
      const err = e as {
        message?: string;
        stdout?: unknown;
        stderr?: unknown;
        code?: unknown;
        signal?: unknown;
      };
      const out = String(err.stdout ?? '');
      const se = String(err.stderr ?? '');
      const durationMs = Date.now() - startedAt;
      const exitCode = typeof err.code === 'number' ? err.code : null;
      const extracted = summarizeShellOutput(out, se);
      return JSON.stringify({
        success: false,
        command,
        cwd: root,
        exitCode,
        signal: typeof err.signal === 'string' ? err.signal : null,
        durationMs,
        error: err.message ?? String(e),
        stdout: out.slice(0, 500_000),
        stderr: se.slice(0, 100_000),
        truncated: out.length > 500_000 || se.length > 100_000,
        keyErrors: extracted.keyErrors,
        summary: extracted.summary,
      });
    }
  } catch (e: any) {
    return JSON.stringify({ error: e.message });
  }
}
