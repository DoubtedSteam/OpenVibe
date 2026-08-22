import { spawn } from 'child_process';
import type { ChildProcess } from 'child_process';
import { getWorkspaceRoot } from '../utils/pathHelpers';

export interface RunShellCommandParams {
  command: string;
  /** Optional abort signal — when aborted, the running process tree is force-killed. */
  signal?: AbortSignal;
}

const MAX_STDOUT = 500_000;
const MAX_STDERR = 100_000;

/** Currently running shell sub-processes (spawned via cmd.exe /c on Windows). */
const _activeProcesses = new Set<ChildProcess>();

/**
 * Force-kill the ENTIRE process tree of a spawned child.
 *
 * On Windows, `child.kill()` only kills the shell wrapper (cmd.exe) and leaves
 * its descendants (npm/node/tsc/dev servers...) running as orphans, so we use
 * `taskkill /pid <pid> /T /F` which recursively kills the whole tree.
 * On POSIX, a negative PID signals the whole process group.
 */
function _killProcessTree(child: ChildProcess): void {
  const pid = child.pid;
  if (pid == null) return;
  try {
    if (process.platform === 'win32') {
      const killer = spawn('taskkill', ['/pid', String(pid), '/T', '/F'], {
        windowsHide: true,
        stdio: 'ignore',
      });
      killer.unref();
    } else {
      try {
        process.kill(-pid, 'SIGTERM');
      } catch {
        // No process group available — fall back to killing the child itself.
        try {
          child.kill('SIGTERM');
        } catch {
          /* ignore */
        }
      }
      const t = setTimeout(() => {
        try {
          child.kill('SIGKILL');
        } catch {
          /* ignore */
        }
      }, 800);
      t.unref();
    }
  } catch {
    // ignore
  }
}

/** Force-kill every shell command currently running through this tool. */
export function killActiveShellProcesses(): void {
  const procs = Array.from(_activeProcesses);
  _activeProcesses.clear();
  for (const p of procs) {
    _killProcessTree(p);
  }
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

/**
 * Execute a shell command in the workspace root directory.
 *
 * Runs via `spawn` with the system shell (cmd.exe on Windows), so the child
 * process can be tracked and force-killed (including its whole process tree)
 * when `signal` is aborted — this is what makes the UI "stop" button able to
 * terminate long-running commands like npm install / dev servers.
 *
 * Output is captured (stdout + stderr) and returned. Error-level TypeScript
 * diagnostics in the output are automatically extracted for quick feedback.
 *
 * @param params.command  The shell command to execute.
 * @param params.signal   Optional AbortSignal — aborting it kills the process tree.
 * @returns JSON string with `{ stdout, stderr, keyErrors, summary, exitCode, killed }`.
 */
export async function runShellCommandTool(params: RunShellCommandParams): Promise<string> {
  try {
    const root = getWorkspaceRoot();
    const command = (params.command ?? '').trim();
    if (!command) {
      return JSON.stringify({ error: 'command is empty' });
    }
    const signal = params.signal;
    const startedAt = Date.now();

    // Already aborted before the process even started.
    if (signal?.aborted) {
      return JSON.stringify({
        success: false,
        command,
        cwd: root,
        exitCode: null,
        durationMs: 0,
        error: 'Operation stopped by user.',
        killed: true,
        stdout: '',
        stderr: '',
        truncated: false,
        keyErrors: [],
        summary: 'Killed by user (operation stopped).',
      });
    }

    return await new Promise<string>((resolve) => {
      let stdout = '';
      let stderr = '';
      let truncated = false;
      let aborted = false;
      let settled = false;

      const child = spawn(command, { cwd: root, shell: true, windowsHide: true });
      _activeProcesses.add(child);

      const onAbort = (): void => {
        aborted = true;
        _killProcessTree(child);
        // taskkill /T /F is async — never let the tool hang: force-resolve shortly after.
        const t = setTimeout(() => {
          finish({
            success: false,
            command,
            cwd: root,
            exitCode: null,
            durationMs: Date.now() - startedAt,
            error: 'Operation stopped by user.',
            killed: true,
            stdout,
            stderr,
            truncated,
            keyErrors: [],
            summary: 'Killed by user (operation stopped).',
          });
        }, 1500);
        t.unref();
      };
      signal?.addEventListener('abort', onAbort, { once: true });

      const finish = (payload: Record<string, unknown>): void => {
        if (settled) return;
        settled = true;
        _activeProcesses.delete(child);
        try {
          signal?.removeEventListener('abort', onAbort);
        } catch {
          /* ignore */
        }
        resolve(JSON.stringify(payload));
      };

      child.stdout?.on('data', (d: Buffer) => {
        if (stdout.length < MAX_STDOUT) {
          stdout += String(d);
          if (stdout.length > MAX_STDOUT) {
            stdout = stdout.slice(0, MAX_STDOUT);
            truncated = true;
          }
        } else {
          truncated = true;
        }
      });
      child.stderr?.on('data', (d: Buffer) => {
        if (stderr.length < MAX_STDERR) {
          stderr += String(d);
          if (stderr.length > MAX_STDERR) {
            stderr = stderr.slice(0, MAX_STDERR);
            truncated = true;
          }
        } else {
          truncated = true;
        }
      });

      child.on('error', (err: Error) => {
        finish({
          success: false,
          command,
          cwd: root,
          exitCode: null,
          durationMs: Date.now() - startedAt,
          error: err.message,
          stdout,
          stderr,
          truncated,
          keyErrors: [],
          summary: err.message,
        });
      });

      child.on('close', (code, sig) => {
        if (aborted) {
          finish({
            success: false,
            command,
            cwd: root,
            exitCode: null,
            durationMs: Date.now() - startedAt,
            error: 'Operation stopped by user.',
            killed: true,
            stdout,
            stderr,
            truncated,
            keyErrors: [],
            summary: 'Killed by user (operation stopped).',
          });
          return;
        }
        const extracted = summarizeShellOutput(stdout, stderr);
        finish({
          success: code === 0,
          command,
          cwd: root,
          exitCode: code,
          signal: typeof sig === 'string' ? sig : null,
          durationMs: Date.now() - startedAt,
          stdout,
          stderr,
          truncated,
          keyErrors: extracted.keyErrors,
          summary: extracted.summary,
        });
      });
    });
  } catch (e: any) {
    return JSON.stringify({ error: e.message });
  }
}

