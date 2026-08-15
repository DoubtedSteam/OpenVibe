import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { resolveWorkspacePath, getWorkspaceRoot } from '../utils/pathHelpers';
import { getRuntimeEnvironmentSummary } from '../agentRuntimeContext';

// ─── get_workspace_info ───────────────────────────────────────────────────────

/**
 * 从 `.OpenVibe/memory/` 构建轻量索引摘要（B 级）：
 * 已知面 = 记忆规模（L1 一句话 + L2 登记文件数 + L3 建档组件数），
 * 未知面 = 顶层条目中未登记于 L2 的（探索指引，不预写条目）。
 * 仅做行级解析，不加载全量内容；受 vibe-coding.memorySync.enabled 开关控制。
 */
function buildMemorySummary(topLevelEntries: string[]): Record<string, unknown> | null {
  try {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!root) return null;
    const memDir = path.join(root, '.OpenVibe', 'memory');
    if (!fs.existsSync(memDir)) return null;

    const read = (f: string): string => {
      const fp = path.join(memDir, f);
      return fs.existsSync(fp) ? fs.readFileSync(fp, 'utf-8') : '';
    };
    const l1 = read('L1-purpose.md');
    const l2 = read('L2-inventory.md');
    const l3 = read('L3-roles.md');

    // 已知面：L1 一句话定义 + 记忆规模（L2 登记文件数 / L3 建档组件数）
    const project = (l1.match(/## One-line description\s*\n([^\n]+)/) || [])[1]?.trim() || '(未定义)';
    const knownFiles = (l2.match(/[├└]── [^\n]*\.(?:ts|js|mjs|json|md|jsonc)\b[^\n]*/g) || []).length;
    const knownComponents = (l3.match(/^### /gm) || []).length;

    // 未知面：顶层条目中未登记于 L2 目录树（行首 ├──/└── 条目，含收尾行）
    const knownTop = new Set(
      (l2.match(/^[├└]── ([^\s#│]+)/gm) || []).map((m) => m.replace(/^[├└]── /, '').replace(/\/$/, ''))
    );
    const unknownTop = topLevelEntries.filter((e) => !knownTop.has(e));

    return {
      bootstrap: true,
      project,
      known: { files: knownFiles, components: knownComponents },
      unknown: {
        topLevel: unknownTop,
        note: '未探索区域仅供探索指引；不要为未 read 过的文件预写 L2/L3 条目（增量学习：未接触 = 无条目）。需要细节时 read_file .OpenVibe/memory/L2-inventory.md 或 L3-roles.md。',
      },
    };
  } catch {
    return null;
  }
}

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

  // Memory 摘要：受 vibe-coding.memorySync.enabled 开关控制（关闭时省略该字段）
  let memorySummary: Record<string, unknown> | null = null;
  if (vscode.workspace.getConfiguration('vibe-coding').get<boolean>('memorySync.enabled', true) !== false) {
    memorySummary = buildMemorySummary(entries);
  }

  return JSON.stringify({
    workspaceRoot: root,
    topLevelEntries: entries,
    hint: 'Use relative paths (e.g. "src/index.ts") when calling read_file or find_in_file.',
    ...(memorySummary ? { memorySummary } : {}),
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
