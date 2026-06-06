import * as vscode from 'vscode';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface GetTerminalContentParams {
  /** Optional terminal name filter. If omitted, returns all terminals. */
  terminalName?: string;
  /** Number of recent lines to return per terminal (default: 100). */
  lines?: number;
}

interface TerminalBuffer {
  name: string;
  lines: string[];
  commandCount: number;
}

// ─── State ───────────────────────────────────────────────────────────────────

const DEFAULT_MAX_LINES = 100;

/** Map: terminal name → circular buffer */
const _buffers = new Map<string, TerminalBuffer>();

// ─── Activation ──────────────────────────────────────────────────────────────

/**
 * Activate terminal output tracking via VS Code Shell Integration API.
 * Registers listeners on the extension context.
 * Requires VS Code 1.82+; gracefully degrades if the API is absent.
 */
export function activateTerminalTracking(context: vscode.ExtensionContext): void {
  // Guard: shell integration API (VS Code 1.82+)
  if (typeof (vscode.window as any).onDidStartTerminalShellExecution !== 'function') {
    console.warn('[OpenVibe] Terminal shell integration API not available (requires VS Code 1.82+).');
    return;
  }

  // Listen for every shell command execution
  context.subscriptions.push(
    (vscode.window as any).onDidStartTerminalShellExecution(async (event: any) => {
      const terminal: vscode.Terminal = event.terminal;
      const execution = event.execution;
      const termName = terminal.name || `terminal-${Date.now()}`;

      // Get or create buffer for this terminal
      let buf = _buffers.get(termName);
      if (!buf) {
        buf = { name: termName, lines: [], commandCount: 0 };
        _buffers.set(termName, buf);
      }
      buf.commandCount++;

      // Record the command line
      const cmdLine: string = execution.commandLine?.value ?? '';
      buf.lines.push(`> ${cmdLine}`);
      _trimBuffer(buf);

      // Read the output stream
      try {
        const stream: ReadableStream<string> = execution.read();
        const reader = stream.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunks = value.split(/\r?\n/);
          for (const chunk of chunks) {
            if (chunk) buf.lines.push(chunk);
          }
          _trimBuffer(buf);
        }
      } catch {
        // Shell integration may not work for all terminal types; silently ignore
      }
    })
  );

  // Clean up buffers when terminals close
  context.subscriptions.push(
    vscode.window.onDidCloseTerminal((terminal: vscode.Terminal) => {
      if (terminal.name) _buffers.delete(terminal.name);
    })
  );
}

// ─── Tool ────────────────────────────────────────────────────────────────────

/**
 * Get the recent output of user's VS Code terminal(s).
 *
 * Returns a JSON string with:
 * - `activeTerminal`: name of the currently focused terminal (or null)
 * - `terminals[]`: list of terminals with their recent output
 *   - `name`, `isActive`, `commandCount`, `totalLines`, `output` (last N lines joined)
 */
export function getTerminalContentTool(params: GetTerminalContentParams): string {
  try {
    const maxLines = Math.max(1, params.lines ?? DEFAULT_MAX_LINES);
    const filterName = params.terminalName?.trim();
    const activeTerm = vscode.window.activeTerminal;

    const result: {
      success: boolean;
      activeTerminal: string | null;
      terminals: {
        name: string;
        isActive: boolean;
        commandCount: number;
        totalLines: number;
        output: string;
      }[];
    } = {
      success: true,
      activeTerminal: activeTerm?.name ?? null,
      terminals: [],
    };

    // Collect from tracked buffers
    for (const [, buf] of _buffers) {
      if (filterName && buf.name !== filterName) continue;
      const recent = buf.lines.slice(-maxLines);
      result.terminals.push({
        name: buf.name,
        isActive: activeTerm?.name === buf.name,
        commandCount: buf.commandCount,
        totalLines: buf.lines.length,
        output: recent.join('\n'),
      });
    }

    // Also list VS Code terminals that haven't produced output yet
    for (const term of vscode.window.terminals) {
      if (filterName && term.name !== filterName) continue;
      if (!_buffers.has(term.name)) {
        result.terminals.push({
          name: term.name,
          isActive: activeTerm?.name === term.name,
          commandCount: 0,
          totalLines: 0,
          output: '(no output captured yet — run a command first)',
        });
      }
    }

    // Sort: active terminal first, then by name
    result.terminals.sort((a, b) => {
      if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    return JSON.stringify(result);
  } catch (e: any) {
    return JSON.stringify({ success: false, error: e.message });
  }
}


// ─── Cleanup ─────────────────────────────────────────────────────────────────

/** 清除所有终端输出缓冲区。扩展停用时调用。 */
export function clearTerminalBuffers(): void {
  _buffers.clear();
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Trim buffer lines to 2× default max (headroom), keeping at least maxLines. */
function _trimBuffer(buf: TerminalBuffer): void {
  const maxKeep = DEFAULT_MAX_LINES * 2;
  if (buf.lines.length > maxKeep) {
    buf.lines.splice(0, buf.lines.length - DEFAULT_MAX_LINES);
  }
}
