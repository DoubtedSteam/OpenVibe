import * as fs from 'fs';
import * as path from 'path';
import {
  resolveWorkspacePath,
  getWorkspaceRoot,
  readLines,
} from '../utils/pathHelpers';

export interface ReadFileParams {
  filePath: string;
  startLine?: number;
  endLine?: number;
}

/**
 * Read the contents of a file (or list directory entries).
 *
 * Returns the file's lines with line numbers prefixed, or a JSON listing of
 * directory contents if the path points to a directory.
 *
 * @param params.filePath  Workspace-relative path to the file or directory.
 * @param params.startLine Optional first line to read (1-based, default 1).
 * @param params.endLine   Optional last line to read (1-based, default EOF).
 * @returns Formatted text with numbered lines, or a JSON error string.
 */
export function readFileTool(params: ReadFileParams): string {
  let absPath: string;
  try {
    absPath = resolveWorkspacePath(params.filePath);
  } catch (e: any) {
    return JSON.stringify({ error: e.message });
  }

  if (!fs.existsSync(absPath)) {
    return JSON.stringify({ error: `File not found: ${params.filePath}` });
  }

  // ─── If directory, return directory listing ──────────────────────────────
  if (fs.statSync(absPath).isDirectory()) {
    try {
      const entries = fs.readdirSync(absPath, { withFileTypes: true });
      const root = getWorkspaceRoot();
      const relPath = path.relative(root, absPath).replace(/\\/g, '/') || '.';

      const listing = entries.map((entry) => ({
        name: entry.name,
        type: entry.isDirectory() ? 'directory' : 'file',
        size: entry.isFile() ? fs.statSync(path.join(absPath, entry.name)).size : 0,
      }));

      // Sort: directories first, then files, alphabetically within each group
      listing.sort((a, b) => {
        if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

      return JSON.stringify({
        isDirectory: true,
        path: relPath,
        absolutePath: absPath,
        entries: listing,
        totalEntries: listing.length,
      });
    } catch (e: any) {
      return JSON.stringify({ error: `Cannot read directory: ${params.filePath} — ${e.message}` });
    }
  }

  // ─── Regular file reading ─────────────────────────────────────────────────
  const { lines } = readLines(absPath);
  const total = lines.length;
  const start = Math.max(1, params.startLine ?? 1);
  const end = Math.min(total, params.endLine ?? total);

  const content = lines
    .slice(start - 1, end)
    .map((l, i) => `${start + i}: ${l}`)
    .join('\n');

  return JSON.stringify({ content, totalLines: total, startLine: start, endLine: end });
}
