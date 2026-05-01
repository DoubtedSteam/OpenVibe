import * as vscode from 'vscode';
import * as path from 'path';
import { getWorkspaceRoot } from '../utils/pathHelpers';

export interface GrepSearchParams {
  pattern: string;
  includePattern?: string;
  excludePattern?: string;
  maxResults?: number;
  caseSensitive?: boolean;
}

/**
 * Search across all workspace files for a given text pattern.
 *
 * Uses VS Code's `workspace.findFiles` for file discovery and reads each
 * matching file to find line-level matches. Supports case-sensitive or
 * case-insensitive search, glob-based file include/exclude, and a cap on
 * the number of results.
 *
 * @param params.pattern          Text pattern to search for (literal string, not regex).
 * @param params.includePattern   Glob pattern to include files (default "**\/*").
 * @param params.excludePattern   Glob pattern to exclude (default excludes node_modules, .git, etc.).
 * @param params.maxResults       Maximum matches to return (default 50, max 200).
 * @param params.caseSensitive    Whether search is case-sensitive (default true).
 * @returns JSON string with matching file paths, line numbers, and line content.
 */
export async function grepSearchTool(params: GrepSearchParams): Promise<string> {
  try {
    const root = getWorkspaceRoot();
    const pattern = params.pattern;
    const includeGlob = params.includePattern || '**/*';
    const excludeGlob = params.excludePattern || '**/{node_modules,.git,out,dist,.vscode,.OpenVibe}/**';
    const maxResults = Math.min(params.maxResults ?? 50, 200);
    const caseSensitive = params.caseSensitive !== false;

    const uris = await vscode.workspace.findFiles(includeGlob, excludeGlob, 500);

    const results: { file: string; line: number; content: string }[] = [];
    const searchStr = caseSensitive ? pattern : pattern.toLowerCase();

    for (const uri of uris) {
      if (results.length >= maxResults) break;
      try {
        const doc = await vscode.workspace.openTextDocument(uri);
        const lines = doc.getText().split(/\r?\n/);
        for (let i = 0; i < lines.length; i++) {
          if (results.length >= maxResults) break;
          const line = lines[i];
          const match = caseSensitive ? line.includes(searchStr) : line.toLowerCase().includes(searchStr);
          if (match) {
            results.push({
              file: path.relative(root, uri.fsPath).replace(/\\/g, '/'),
              line: i + 1,
              content: line.trim(),
            });
          }
        }
      } catch {
        continue;
      }
    }

    return JSON.stringify({
      success: true,
      pattern,
      totalFilesSearched: uris.length,
      totalMatches: results.length,
      truncated: results.length >= maxResults,
      matches: results,
    });
  } catch (e: any) {
    return JSON.stringify({ error: 'grep_search failed: ' + e.message });
  }
}
