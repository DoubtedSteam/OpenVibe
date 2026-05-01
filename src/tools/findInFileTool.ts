import * as fs from 'fs';
import * as path from 'path';
import {
  resolveWorkspacePath,
  getWorkspaceRoot,
  readLines,
} from '../utils/pathHelpers';

export interface FindParams {
  filePath: string;
  searchString: string;
  contextBefore?: number;
  contextAfter?: number;
  occurrence?: number;
}

/**
 * Search for an exact string inside a file and return matching line numbers
 * with surrounding context.
 *
 * When the path points to a directory (instead of a file), performs a
 * fuzzy filename search across all entries in that directory.
 *
 * @param params.filePath    Workspace-relative path to the file (or directory).
 * @param params.searchString  Exact case-sensitive string to search for.
 * @param params.contextBefore  Lines of context to show before each match (default 2).
 * @param params.contextAfter   Lines of context to show after each match (default 2).
 * @param params.occurrence     Which occurrence to return (default 1 = first).
 * @returns Formatted text with match location and context, or a JSON error string.
 */
export function findInFileTool(params: FindParams): string {
  let absPath: string;
  try {
    absPath = resolveWorkspacePath(params.filePath);
  } catch (e: any) {
    return JSON.stringify({ error: e.message });
  }

  if (!fs.existsSync(absPath)) {
    return JSON.stringify({ error: `File not found: ${params.filePath}` });
  }

  // ─── If directory, search by file name ──────────────────────────────────
  if (fs.statSync(absPath).isDirectory()) {
    try {
      const entries = fs.readdirSync(absPath, { withFileTypes: true });
      const root = getWorkspaceRoot();
      const relPath = path.relative(root, absPath).replace(/\\/g, '/') || '.';
      const searchLower = params.searchString.toLowerCase();

      const matching = entries
        .filter((entry) => entry.name.toLowerCase().includes(searchLower))
        .map((entry) => ({
          name: entry.name,
          type: entry.isDirectory() ? 'directory' : 'file',
          size: entry.isFile() ? fs.statSync(path.join(absPath, entry.name)).size : 0,
        }));

      matching.sort((a, b) => {
        if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

      return JSON.stringify({
        isDirectory: true,
        path: relPath,
        absolutePath: absPath,
        searchString: params.searchString,
        entries: matching,
        totalEntries: entries.length,
        totalMatches: matching.length,
      });
    } catch (e: any) {
      return JSON.stringify({ error: `Cannot search directory: ${params.filePath} — ${e.message}` });
    }
  }

  const { lines } = readLines(absPath);

  const total = lines.length;
  const occurrence = params.occurrence ?? 1;
  const ctxBefore = params.contextBefore ?? 2;
  const ctxAfter = params.contextAfter ?? 2;

  let matchCount = 0;
  let matchLine = -1;
  let matchCol = -1;

  for (let i = 0; i < lines.length; i++) {
    const col = lines[i].indexOf(params.searchString);
    if (col !== -1) {
      matchCount++;
      if (matchCount === occurrence) {
        matchLine = i + 1; // 1-based
        matchCol = col + 1; // 1-based
      }
    }
  }

  if (matchLine === -1) {
    return JSON.stringify({ found: false, totalOccurrences: matchCount });
  }

  const ctxStart = Math.max(1, matchLine - ctxBefore);
  const ctxEnd = Math.min(total, matchLine + ctxAfter);
  const contextLines = lines
    .slice(ctxStart - 1, ctxEnd)
    .map((l, i) => {
      const ln = ctxStart + i;
      return `${ln === matchLine ? '>>>' : '   '} ${ln}: ${l}`;
    })
    .join('\n');

  return JSON.stringify({
    found: true,
    lineNumber: matchLine,
    column: matchCol,
    contextLines,
    totalOccurrences: matchCount,
  });
}
