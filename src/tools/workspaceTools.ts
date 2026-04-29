import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { resolveWorkspacePath, getWorkspaceRoot } from '../utils/pathHelpers';
import { getRuntimeEnvironmentSummary } from '../agentRuntimeContext';

// ─── get_workspace_info ───────────────────────────────────────────────────────

export function getWorkspaceInfoTool(): string {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    return JSON.stringify({
      error: 'No workspace folder is open in VS Code. ' +
             'Please open a folder via File → Open Folder, then retry.',
    });
  }
  const root = folders[0].uri.fsPath;
  let entries: string[] = [];
  try {
    entries = fs.readdirSync(root).filter(
      (f) => !f.startsWith('.') && f !== 'node_modules' && f !== 'out'
    );
  } catch { /* ignore read errors */ }

  return JSON.stringify({
    workspaceRoot: root,
    topLevelEntries: entries,
    hint: 'Use relative paths (e.g. "src/index.ts") when calling read_file or find_in_file.',
    ...getRuntimeEnvironmentSummary(),
  });
}

// ─── create_directory ─────────────────────────────────────────────────────────

export interface CreateDirectoryParams {
  dirPath: string;
  recursive?: boolean;
}

export function createDirectoryTool(params: CreateDirectoryParams): string {
  let absPath: string;
  try {
    absPath = resolveWorkspacePath(params.dirPath);
  } catch (e: any) {
    return JSON.stringify({ error: e.message });
  }

  if (fs.existsSync(absPath)) {
    const stat = fs.statSync(absPath);
    if (stat.isDirectory()) {
      return JSON.stringify({ 
        success: true, 
        message: `Directory already exists: ${params.dirPath}`,
        path: absPath 
      });
    } else {
      return JSON.stringify({ 
        error: `Path exists but is not a directory: ${params.dirPath}` 
      });
    }
  }

  try {
    fs.mkdirSync(absPath, { recursive: params.recursive ?? true });
    return JSON.stringify({ 
      success: true, 
      message: `Directory created: ${params.dirPath}`,
      path: absPath,
      recursive: params.recursive ?? true
    });
  } catch (e: any) {
    return JSON.stringify({ 
      error: `Failed to create directory: ${e.message}` 
    });
  }
}

// ─── get_diagnostics ─────────────────────────────────────────────────────────

export interface GetDiagnosticsParams {
  uri?: string;
  filePath?: string;
}

export function getDiagnosticsTool(params: GetDiagnosticsParams): string {
  try {
    let targetUri: vscode.Uri | undefined;
    
    if (params.filePath) {
      const absPath = resolveWorkspacePath(params.filePath);
      targetUri = vscode.Uri.file(absPath);
    } else if (params.uri) {
      targetUri = vscode.Uri.parse(params.uri);
    }
    
    let result: object[];
    if (targetUri) {
      const diags = vscode.languages.getDiagnostics(targetUri);
      result = [{
        uri: targetUri.toString(),
        diagnostics: diags.map(d => ({
          message: d.message,
          severity: d.severity,
          code: d.code,
          source: d.source,
          range: {
            start: { line: d.range.start.line + 1, character: d.range.start.character + 1 },
            end:   { line: d.range.end.line + 1,   character: d.range.end.character + 1 },
          },
        })),
      }];
    } else {
      const allDiags = vscode.languages.getDiagnostics();
      result = allDiags.map(([uri, diags]) => ({
        uri: uri.toString(),
        diagnostics: diags.map(d => ({
          message: d.message,
          severity: d.severity,
          code: d.code,
          source: d.source,
          range: {
            start: { line: d.range.start.line + 1, character: d.range.start.character + 1 },
            end:   { line: d.range.end.line + 1,   character: d.range.end.character + 1 },
          },
        })),
      }));
    }
    
    return JSON.stringify({
      success: true,
      totalFiles: result.length,
      diagnostics: result,
      message: params.filePath || params.uri 
        ? `Got diagnostics for specified ${params.filePath ? 'file' : 'URI'}`
        : 'Got diagnostics for all files in workspace',
    });
  } catch (e: any) {
    return JSON.stringify({ 
      error: `Failed to get diagnostics: ${e.message}` 
    });
  }
}

// ─── get_file_info ───────────────────────────────────────────────────────────

export interface GetFileInfoParams {
  filePath: string;
}

export function getFileInfoTool(params: GetFileInfoParams): string {
  try {
    const abs = resolveWorkspacePath(params.filePath);
    if (!fs.existsSync(abs)) {
      return JSON.stringify({
        success: true,
        exists: false,
        filePath: params.filePath,
        absolutePath: abs,
        message: 'Path does not exist',
      });
    }
    const stat = fs.statSync(abs);
    return JSON.stringify({
      success: true,
      exists: true,
      filePath: params.filePath,
      absolutePath: abs,
      isFile: stat.isFile(),
      isDirectory: stat.isDirectory(),
      size: stat.size,
      mtimeMs: stat.mtimeMs,
      mtimeIso: new Date(stat.mtimeMs).toISOString(),
    });
  } catch (e: any) {
    return JSON.stringify({ error: e.message });
  }
}
