import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

// ─── Path helpers ─────────────────────────────────────────────────────────────

/**
 * Get the absolute file-system path of the first workspace folder.
 * @throws Error if no workspace is open.
 */
function getWorkspaceRoot(): string {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    throw new Error('No workspace folder is open');
  }
  return folders[0].uri.fsPath;
}

/**
 * Resolve a possibly-relative workspace path to an absolute filesystem path.
 * Path traversal attacks are blocked: any resolved path outside the workspace
 * root throws an error.
 * @param filePath  Workspace-relative or absolute path.
 * @returns Absolute file-system path.
 * @throws Error if the path escapes the workspace directory.
 */
function resolveWorkspacePath(filePath: string): string {
  const root = getWorkspaceRoot();
  const abs = path.isAbsolute(filePath) ? filePath : path.join(root, filePath);
  const rel = path.relative(root, abs);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`Access denied: path is outside workspace: ${filePath}`);
  }
  return abs;
}

/** True if the workspace-relative path exists and is a regular file (not a directory). */
export function workspaceFileExistsRelative(filePath: string): boolean {
  try {
    const abs = resolveWorkspacePath(filePath);
    if (!fs.existsSync(abs)) {
      return false;
    }
    return fs.statSync(abs).isFile();
  } catch {
    return false;
  }
}

// ─── Line I/O ─────────────────────────────────────────────────────────────────

/**
 * Read a file from an absolute path and split it into lines.
 * Detects whether the file uses CRLF or LF line endings.
 * @returns lines and a boolean indicating CRLF (true) vs LF (false).
 */
function readLines(absPath: string): { lines: string[]; crlf: boolean } {
  const raw = fs.readFileSync(absPath, 'utf-8');
  const crlf = raw.includes('\r\n');
  return { lines: raw.split(/\r?\n/), crlf };
}

/**
 * Write an array of lines to an absolute file path.
 * Uses CRLF or LF as the line separator based on the `crlf` flag.
 */
function writeLines(absPath: string, lines: string[], crlf: boolean): void {
  fs.writeFileSync(absPath, lines.join(crlf ? '\r\n' : '\n'), 'utf-8');
}

/** Normalize model/tool-supplied replacement text: CRLF → LF, legacy CR → LF, then split. */
function splitLinesForEditInput(raw: string): string[] {
  let t = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  if (t === '') {
    return [];
  }
  return t.split('\n');
}

function splitLinesNormalized(raw: string): string[] {
  const t = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  return t.split('\n');
}

/** When creating a new file, prefer CRLF if the patch text clearly uses it; otherwise LF if only \n; else OS default. */
function inferCrlfForNewFile(raw: string): boolean {
  if (raw.includes('\r\n')) {
    return true;
  }
  if (/\r/.test(raw)) {
    return true;
  }
  if (raw.includes('\n')) {
    return false;
  }
  return process.platform === 'win32';
}

export {
  getWorkspaceRoot,
  resolveWorkspacePath,
  readLines,
  writeLines,
  splitLinesForEditInput,
  splitLinesNormalized,
  inferCrlfForNewFile,
};