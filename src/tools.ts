import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

// ─── Path helpers ─────────────────────────────────────────────────────────────

function getWorkspaceRoot(): string {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    throw new Error('No workspace folder is open');
  }
  return folders[0].uri.fsPath;
}

function resolveWorkspacePath(filePath: string): string {
  const root = getWorkspaceRoot();
  const abs = path.isAbsolute(filePath) ? filePath : path.join(root, filePath);
  const rel = path.relative(root, abs);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`Access denied: path is outside workspace: ${filePath}`);
  }
  return abs;
}

// ─── Line I/O ─────────────────────────────────────────────────────────────────

function readLines(absPath: string): { lines: string[]; crlf: boolean } {
  const raw = fs.readFileSync(absPath, 'utf-8');
  const crlf = raw.includes('\r\n');
  return { lines: raw.split(/\r?\n/), crlf };
}

function writeLines(absPath: string, lines: string[], crlf: boolean): void {
  fs.writeFileSync(absPath, lines.join(crlf ? '\r\n' : '\n'), 'utf-8');
}

// ─── read_file ────────────────────────────────────────────────────────────────

export interface ReadFileParams {
  filePath: string;
  startLine?: number;
  endLine?: number;
}

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

// ─── find_in_file ─────────────────────────────────────────────────────────────

export interface FindParams {
  filePath: string;
  searchString: string;
  contextBefore?: number;
  contextAfter?: number;
  occurrence?: number;
}

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
  // List top-level entries so the LLM can see what is available
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
  });
}

// ─── replace_lines ────────────────────────────────────────────────────────────

export interface ReplaceParams {
  filePath: string;
  startLine: number;
  endLine: number;
  newContent: string;
}

/**
 * Context passed to the LLM check function for secondary confirmation.
 * beforeContext: the lines being replaced + up to 10 lines of surrounding context (before the change).
 * afterContext:  the replacement content + the same surrounding lines (after the change, virtual).
 */
export interface ReplaceCheckContext {
  filePath: string;
  startLine: number;
  endLine: number;           // clamped end line (actual range being replaced)
  beforeContext: string;     // numbered lines: [ctx_start..ctx_end], with >>> marking the replaced range
  afterContext: string;      // numbered lines: same surroundings but with newContent substituted in
}

export async function replaceLinesTool(
  params: ReplaceParams,
  llmCheckFn: (ctx: ReplaceCheckContext) => Promise<boolean>,
  userConfirmFn?: (ctx: ReplaceCheckContext) => Promise<boolean>
): Promise<string> {
  let absPath: string;
  try {
    absPath = resolveWorkspacePath(params.filePath);
  } catch (e: any) {
    return JSON.stringify({ error: e.message });
  }

  // Check if path exists and is a directory
  if (fs.existsSync(absPath)) {
    const stat = fs.statSync(absPath);
    if (stat.isDirectory()) {
      return JSON.stringify({ error: `Cannot replace a directory: ${params.filePath}` });
    }
  }

  let lines: string[] = [];
  let crlf = false; // default for new files
  let total = 0;
  
  // Handle file creation or reading existing file
  if (!fs.existsSync(absPath)) {
    // For new files, startLine must be 1
    if (params.startLine !== 1) {
      return JSON.stringify({ 
        error: `Cannot create new file: startLine must be 1 for new files (got ${params.startLine})` 
      });
    }
    
    // For new files, endLine must be 0 (insert operation)
    if (params.endLine !== 0) {
      return JSON.stringify({ 
        error: `Cannot create new file: endLine must be 0 for new files (got ${params.endLine})` 
      });
    }
  } else {
    // Read existing file
    const result = readLines(absPath);
    lines = result.lines;
    crlf = result.crlf;
    total = lines.length;
  }

  // Support insert-before-start (endLine = startLine - 1)
  // For new files, total is 0, startLine is 1, endLine is 0
  if (params.startLine < 1 || params.startLine > total + 1) {
    return JSON.stringify({ error: `startLine ${params.startLine} is out of range (file has ${total} lines)` });
  }
  const clampedEnd = Math.min(Math.max(params.startLine - 1, params.endLine), total);

  const oldLines = lines.slice(params.startLine - 1, clampedEnd);
  // Normalize literal \n (escaped) to real newlines, in case the LLM serialized them as escape sequences
  const normalizedContent = params.newContent.replace(/\\n/g, '\n');
  const newLines = normalizedContent !== '' ? normalizedContent.split('\n') : [];
  // ── Build context windows (±10 lines) ──────────────────────────────────────
  const CTX = 10;
  const isNewFile = total === 0 && !fs.existsSync(absPath);
  
  let beforeContext: string;
  if (isNewFile) {
    beforeContext = "   (New file, no content yet)";
  } else {
    const ctxStart = Math.max(1, params.startLine - CTX);           // 1-based
    const ctxEnd   = Math.min(total, clampedEnd + CTX);             // 1-based (before change)
    
    beforeContext = lines
      .slice(ctxStart - 1, ctxEnd)
      .map((l, i) => {
        const ln = ctxStart + i;
        const inRange = ln >= params.startLine && ln <= clampedEnd;
        return `${inRange ? '>>>' : '   '} ${ln}: ${l}`;
      })
      .join('\n');
  }

  // After: reconstruct the file around the change, then slice the same window
  const afterLines = [
    ...lines.slice(0, params.startLine - 1),
    ...newLines,
    ...lines.slice(clampedEnd),
  ];
  
  let afterContext: string;
  if (isNewFile) {
    afterContext = afterLines
      .map((l, i) => {
        const ln = i + 1;
        return `>>> ${ln}: ${l}`;
      })
      .join('\n');
  } else {
    const ctxStart = Math.max(1, params.startLine - CTX);
    const afterCtxEnd = Math.min(afterLines.length, ctxStart - 1 + CTX + newLines.length + CTX);
    
    afterContext = afterLines
      .slice(ctxStart - 1, afterCtxEnd)
      .map((l, i) => {
        const ln = ctxStart + i;
        const inRange = ln >= params.startLine && ln < params.startLine + newLines.length;
        return `${inRange ? '>>>' : '   '} ${ln}: ${l}`;
      })
      .join('\n');
  }
  // ── LLM secondary confirmation ─────────────────────────────────────────────
  const confirmed = await llmCheckFn({
    filePath: params.filePath,
    startLine: params.startLine,
    endLine: clampedEnd,
    beforeContext,
    afterContext,
  });

  if (!confirmed) {
    return JSON.stringify({ success: false, message: 'LLM check rejected the replacement — operation cancelled' });
  }

  // ── User confirmation (after LLM check passes) ─────────────────────────────
  if (userConfirmFn) {
    const userApproved = await userConfirmFn({
      filePath: params.filePath,
      startLine: params.startLine,
      endLine: clampedEnd,
      beforeContext,
      afterContext,
    });
    if (!userApproved) {
      return JSON.stringify({ success: false, message: 'User rejected the replacement — operation cancelled' });
    }
  }

  // ── Apply the change ───────────────────────────────────────────────────────
  writeLines(absPath, afterLines, crlf);

  const newTotal = afterLines.length;
  
  // Run diagnostics check (simplified version - no async delay for now)
  const diagnosticsInfo = { hasNewDiagnostics: false, count: 0, diagnostics: [] };
  
  return JSON.stringify({
    success: true,
    totalLines: newTotal,
    linesDelta: newTotal - total,
    message: `Replaced lines ${params.startLine}–${clampedEnd}: removed ${oldLines.length}, added ${newLines.length}. File now has ${newTotal} lines.`,
    diagnosticsCheck: diagnosticsInfo
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

  // Check if the directory already exists
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

// ─── memory functions ──────────────────────────────────────────────────────────

export interface MemoryParams {
  action: 'read' | 'write' | 'append';
  section?: string;
  content?: string;
}

export interface MemorySection {
  title: string;
  content: string[];
}

export function getMemoryFilePath(): string {
  const root = getWorkspaceRoot();
  return path.join(root, '.OpenVibe', 'memory.md');
}

export function ensureMemoryDirectory(): void {
  const root = getWorkspaceRoot();
  const memoryDir = path.join(root, '.OpenVibe');
  if (!fs.existsSync(memoryDir)) {
    fs.mkdirSync(memoryDir, { recursive: true });
  }
}

function getDefaultMemoryContent(): string {
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  return `# 项目记忆库

> 最后更新：${dateStr}
> 自动生成于 ${now.toLocaleString()}

---

## 项目概览

- **项目名称**：${path.basename(getWorkspaceRoot())}
- **项目描述**：（请在此处描述项目的主要目的和功能）
- **创建时间**：${dateStr}
- **主要目标**：
  - 目标1
  - 目标2

---

## 目录结构

\`\`\`
# 项目根目录
${getWorkspaceRoot()}

# 主要目录（自动检测）
${fs.readdirSync(getWorkspaceRoot())
  .filter(f => !f.startsWith('.') && f !== 'node_modules' && f !== 'out')
  .map(f => `- ${f}`)
  .join('\n')}
\`\`\`

---

## 重要文件说明

| 文件 | 用途 | 备注 |
|------|------|------|
| （暂无） | | |

---

## 技术栈

- **主要语言**：
- **框架**：
- **构建工具**：
- **测试框架**：
- **数据库**：

---

## 开发规范和约定

1. **代码风格**：
2. **提交规范**：
3. **文档要求**：
4. **测试要求**：

---

## 会话历史摘要

### 最近会话摘要
- **${dateStr}**：项目初始化

---

## 待办事项

- [ ] 补充项目概览信息
- [ ] 完善技术栈描述
- [ ] 添加重要文件说明

---

## 变更记录

| 日期 | 变更内容 | 相关会话 |
|------|----------|----------|
| ${dateStr} | 创建项目记忆库 | 初始化 |

---

## 注意事项

1. 此文件由 OpenVibe 助手自动维护
2. 请定期更新重要信息
3. 删除或修改此文件可能导致助手失去项目上下文
`;
}

export function readMemoryTool(): string {
  try {
    ensureMemoryDirectory();
    const memoryPath = getMemoryFilePath();
    
    if (!fs.existsSync(memoryPath)) {
      // Create default memory file
      const defaultContent = getDefaultMemoryContent();
      fs.writeFileSync(memoryPath, defaultContent, 'utf-8');
      return JSON.stringify({
        exists: false,
        created: true,
        content: defaultContent,
        message: 'Created default memory.md file',
        path: memoryPath
      });
    }
    
    const { lines, crlf } = readLines(memoryPath);
    const content = lines.join(crlf ? '\r\n' : '\n');
    
    return JSON.stringify({
      exists: true,
      created: false,
      content,
      totalLines: lines.length,
      path: memoryPath
    });
  } catch (e: any) {
    return JSON.stringify({ error: `Failed to read memory: ${e.message}` });
  }
}

export function updateMemoryTool(content: string): string {
  try {
    ensureMemoryDirectory();
    const memoryPath = getMemoryFilePath();
    
    fs.writeFileSync(memoryPath, content, 'utf-8');
    
    return JSON.stringify({
      success: true,
      message: 'Memory updated successfully',
      path: memoryPath
    });
  } catch (e: any) {
    return JSON.stringify({ error: `Failed to update memory: ${e.message}` });
  }
}

export function appendToMemorySection(sectionTitle: string, contentToAdd: string): string {
  try {
    ensureMemoryDirectory();
    const memoryPath = getMemoryFilePath();
    
    if (!fs.existsSync(memoryPath)) {
      // Create with default content first
      const defaultContent = getDefaultMemoryContent();
      fs.writeFileSync(memoryPath, defaultContent, 'utf-8');
    }
    
    const { lines, crlf } = readLines(memoryPath);
    
    // Find the section
    let inSection = false;
    let sectionStart = -1;
    let sectionEnd = -1;
    
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith(`## ${sectionTitle}`)) {
        inSection = true;
        sectionStart = i;
        continue;
      }
      
      if (inSection && i > sectionStart && lines[i].startsWith('## ')) {
        sectionEnd = i - 1;
        break;
      }
    }
    
    if (sectionEnd === -1 && inSection) {
      sectionEnd = lines.length - 1;
    }
    
    if (!inSection) {
      // Section not found, add it at the end
      const now = new Date();
      const dateStr = now.toLocaleDateString();
      const newSection = `\n## ${sectionTitle}\n\n${contentToAdd}\n\n_添加于 ${dateStr}_`;
      lines.push(newSection);
    } else {
      // Insert content into existing section
      const insertPos = sectionEnd;
      lines.splice(insertPos + 1, 0, contentToAdd);
    }
    
    fs.writeFileSync(memoryPath, lines.join(crlf ? '\r\n' : '\n'), 'utf-8');
    
    return JSON.stringify({
      success: true,
      message: `Added content to section: ${sectionTitle}`,
      path: memoryPath
    });
  } catch (e: any) {
    return JSON.stringify({ error: `Failed to append to memory: ${e.message}` });
  }
}
// export statements removed to avoid duplicate exports
// ─── Diagnostic comparison helpers ─────────────────────────────────────────────

export interface DiagnosticInfo {
  message: string;
  severity: number;  // vscode.DiagnosticSeverity
  code?: string | number;
  source?: string;
  range: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
}

export interface FileDiagnostics {
  uri: string;
  diagnostics: DiagnosticInfo[];
}

/**
 * 比较修改前后的诊断状态，找出新增的错误
 * @param fileUri 文件URI
 * @param modifiedLineStart 修改开始行号（1-based）
 * @param modifiedLineEnd 修改结束行号（1-based）
 * @param contextLines 上下文行数（默认20，用于筛选附近错误）
 * @returns 新增的诊断信息数组
 */
/**
 * 获取文件的诊断快照
 * @param fileUri 文件URI
 * @returns 诊断信息数组，如果失败则返回空数组
 */
export async function getDiagnosticsSnapshot(fileUri: string): Promise<DiagnosticInfo[]> {
  try {
    const diagResult = getDiagnosticsTool({ uri: fileUri });
    const parsed = JSON.parse(diagResult);
    
    if (!parsed.success || !parsed.diagnostics || !Array.isArray(parsed.diagnostics)) {
      console.warn('Failed to get diagnostics snapshot:', parsed.error || parsed.message);
      return [];
    }
    
    const fileDiags = parsed.diagnostics.find((d: any) => d.uri === fileUri);
    if (!fileDiags || !Array.isArray(fileDiags.diagnostics)) {
      return [];
    }
    
    return fileDiags.diagnostics as DiagnosticInfo[];
  } catch (error) {
    console.error('Error getting diagnostics snapshot:', error);
    return [];
  }
}

/**
 * 比较修改前后的诊断状态，找出新增的错误
 * @param fileUri 文件URI
 * @param modifiedLineStart 修改开始行号（1-based）
 * @param modifiedLineEnd 修改结束行号（1-based）
 * @param contextLines 上下文行数（默认20，用于筛选附近错误）
 * @returns 新增的诊断信息数组
 */
export async function compareDiagnostics(
  fileUri: string,
  modifiedLineStart: number,
  modifiedLineEnd: number,
  contextLines: number = 20
): Promise<DiagnosticInfo[]> {
  try {
    // 获取当前诊断状态
    const diagResult = getDiagnosticsTool({ uri: fileUri });
    const parsed = JSON.parse(diagResult);
    
    if (!parsed.success || !parsed.diagnostics || !Array.isArray(parsed.diagnostics)) {
      console.warn('Failed to get diagnostics for comparison:', parsed.error || parsed.message);
      return [];
    }
    
    // 查找目标文件的诊断信息
    const fileDiags = parsed.diagnostics.find((d: any) => d.uri === fileUri);
    if (!fileDiags || !Array.isArray(fileDiags.diagnostics)) {
      return [];  // 没有该文件的诊断信息
    }
    
    // 筛选出位于修改行附近的新增错误
    const nearbyErrors = fileDiags.diagnostics.filter((diag: DiagnosticInfo) => {
      // 错误行号范围与修改行范围有重叠或接近
      const errorLineStart = diag.range.start.line;
      const errorLineEnd = diag.range.end.line;
      
      // 计算与修改范围的距离
      const distanceToStart = Math.abs(errorLineStart - modifiedLineStart);
      const distanceToEnd = Math.abs(errorLineEnd - modifiedLineEnd);
      const minDistance = Math.min(distanceToStart, distanceToEnd);
      
      // 检查是否在修改范围内或附近
      const isInsideModification = 
        (errorLineStart >= modifiedLineStart && errorLineStart <= modifiedLineEnd) ||
        (errorLineEnd >= modifiedLineStart && errorLineEnd <= modifiedLineEnd) ||
        (modifiedLineStart >= errorLineStart && modifiedLineStart <= errorLineEnd);
      
      const isNearby = minDistance <= contextLines;
      
      // 只关注错误级别的诊断（severity: 0=Error, 1=Warning, 2=Info, 3=Hint）
      const isErrorLevel = diag.severity === 0;
      
      return (isInsideModification || isNearby) && isErrorLevel;
    });
    
    return nearbyErrors;
  } catch (error) {
    console.error('Error comparing diagnostics:', error);
    return [];
  }
}

// ─── get_diagnostics ─────────────────────────────────────────────────────────────
export interface GetDiagnosticsParams {
  uri?: string;
  filePath?: string;
}

export function getDiagnosticsTool(params: GetDiagnosticsParams): string {
  try {
    let targetUri: vscode.Uri | undefined;
    
    // If filePath is provided, resolve it to a URI
    if (params.filePath) {
      const absPath = resolveWorkspacePath(params.filePath);
      targetUri = vscode.Uri.file(absPath);
    } 
    // If uri is provided directly
    else if (params.uri) {
      targetUri = vscode.Uri.parse(params.uri);
    }
    
    // Get diagnostics from VS Code
    let result: object[];
    if (targetUri) {
      // Single file: returns Diagnostic[]
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
      // All files: returns [Uri, Diagnostic[]][]
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
        : 'Got diagnostics for all files in workspace'
    });
  } catch (e: any) {
    return JSON.stringify({ 
      error: `Failed to get diagnostics: ${e.message}` 
    });
  }
}

// ─── Git integration functions ─────────────────────────────────────────────────

function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(16).substring(0, 8);
}

function generateSnapshotId(userInstruction: string): string {
  const timestamp = Date.now();
  const hash = simpleHash(userInstruction);
  return `snapshot-${timestamp}-${hash}`;
}

function executeGitCommand(args: string[], cwd: string): {success: boolean; stdout: string; stderr: string} {
  try {
    const { execFileSync } = require('child_process');
    // Use execFileSync instead of execSync to avoid shell interpretation:
    // commit messages with newlines would break execSync('git commit -m ...').
    const result = execFileSync('git', args, {
      cwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    });
    return {
      success: true,
      stdout: result.toString(),
      stderr: ''
    };
  } catch (error: any) {
    return {
      success: false,
      stdout: error.stdout?.toString() || '',
      stderr: error.stderr?.toString() || error.message
    };
  }
}

function isGitRepository(cwd: string): boolean {
  try {
    const result = executeGitCommand(['rev-parse', '--git-dir'], cwd);
    return result.success;
  } catch {
    return false;
  }
}

function ensureGitRepository(): void {
  const root = getWorkspaceRoot();
  if (!isGitRepository(root)) {
    throw new Error('Workspace is not a Git repository. Please initialize Git first.');
  }
}

export interface GitSnapshotParams {
  sessionId: string;
  userInstruction: string;
  description?: string;
}

export interface GitRollbackParams {
  snapshotId: string;
  sessionId: string;
}

export function gitSnapshotTool(params: GitSnapshotParams): string {
  try {
    console.log(`[GitSnapshot] Starting for session ${params.sessionId}, instruction: "${params.userInstruction.substring(0, 50)}..."`);
    const root = getWorkspaceRoot();
    console.log(`[GitSnapshot] Workspace root: ${root}`);
    ensureGitRepository();
    
    // Check for uncommitted changes
    console.log(`[GitSnapshot] Checking Git status...`);
    const statusResult = executeGitCommand(['status', '--porcelain'], root);
    console.log(`[GitSnapshot] Status result: success=${statusResult.success}, stdout="${statusResult.stdout.trim()}", stderr="${statusResult.stderr}"`);
    if (!statusResult.success) {
      return JSON.stringify({
        error: `Failed to get Git status: ${statusResult.stderr}`
      });
    }
    
    const hasChanges = statusResult.stdout.trim().length > 0;
    if (!hasChanges) {
      return JSON.stringify({
        success: true,
        message: 'No changes to snapshot',
        snapshotId: null
      });
    }
    
    // Create snapshot
    const snapshotId = generateSnapshotId(params.userInstruction);
    const commitMessage = `OpenVibe snapshot: ${snapshotId}

User instruction: ${params.userInstruction.substring(0, 100)}${params.userInstruction.length > 100 ? '...' : ''}`;
    
    // Stage all changes
    const addResult = executeGitCommand(['add', '.'], root);
    if (!addResult.success) {
      return JSON.stringify({
        error: `Failed to stage changes: ${addResult.stderr}`
      });
    }
    
    // Create commit
    const commitResult = executeGitCommand(['commit', '-m', commitMessage], root);
    if (!commitResult.success) {
      return JSON.stringify({
        error: `Failed to create commit: ${commitResult.stderr}`
      });
    }
    
    // Get commit hash
    const hashResult = executeGitCommand(['rev-parse', 'HEAD'], root);
    if (!hashResult.success) {
      return JSON.stringify({
        error: `Failed to get commit hash: ${hashResult.stderr}`
      });
    }
    
    const commitHash = hashResult.stdout.trim();
    
    // Create tag
    const tagName = `vibe-snapshot-${params.sessionId}-${snapshotId}`;
    const tagResult = executeGitCommand(['tag', '-a', tagName, '-m', `Snapshot: ${snapshotId}`], root);
    if (!tagResult.success) {
      console.warn(`Failed to create tag: ${tagResult.stderr}, but commit was created successfully`);
    }
    
    return JSON.stringify({
      success: true,
      snapshotId,
      commitHash,
      gitTag: tagResult.success ? tagName : undefined,
      message: `Created Git snapshot ${snapshotId} for user instruction`,
      hasChanges: true
    });
    
  } catch (e: any) {
    return JSON.stringify({
      error: `Failed to create Git snapshot: ${e.message}`
    });
  }
}

export function gitRollbackTool(params: GitRollbackParams): string {
  try {
    const root = getWorkspaceRoot();
    console.log(`[GitRollback] Starting rollback for snapshot ${params.snapshotId}, session ${params.sessionId}`);
    console.log(`[GitRollback] Workspace root: ${root}`);
    
    ensureGitRepository();
    
    // Try to find the commit by tag
    const tagName = `vibe-snapshot-${params.sessionId}-${params.snapshotId}`;
    console.log(`[GitRollback] Looking for tag: ${tagName}`);
    
    // Check if tag exists
    // Check if tag exists
    const tagCheck = executeGitCommand(['show-ref', '--tags', tagName], root);
    console.log(`[GitRollback] Tag check result: success=${tagCheck.success}, stdout="${tagCheck.stdout.trim()}", stderr="${tagCheck.stderr.trim()}"`);
    
    if (!tagCheck.success || !tagCheck.stdout.trim()) {
      console.log(`[GitRollback] Tag not found: ${tagName}`);
      console.log(`[GitRollback] Trying to find by snapshot ID in commit messages: ${params.snapshotId}`);
      // Try to find by snapshot ID in commit messages
      const logResult = executeGitCommand(['log', '--all', '--grep', params.snapshotId, '--oneline', '-1'], root);
      console.log(`[GitRollback] Log search result: success=${logResult.success}, stdout="${logResult.stdout.trim()}", stderr="${logResult.stderr.trim()}"`);
      if (!logResult.success || !logResult.stdout.trim()) {
        console.log(`[GitRollback] Snapshot not found in commit messages: ${params.snapshotId}`);
        return JSON.stringify({
          error: `Snapshot not found: ${params.snapshotId}`
        });
      }
      
      // Extract commit hash from log output
      const commitHash = logResult.stdout.split(' ')[0];
      console.log(`[GitRollback] Extracted commit hash: ${commitHash}`);
      
      if (!commitHash) {
        console.log(`[GitRollback] Could not extract commit hash from: ${logResult.stdout}`);
        return JSON.stringify({
          error: `Could not find commit for snapshot: ${params.snapshotId}`
        });
      }
      
      // Reset to that commit
      console.log(`[GitRollback] Resetting to commit: ${commitHash}`);
      const resetResult = executeGitCommand(['reset', '--hard', commitHash], root);
      console.log(`[GitRollback] Reset result: success=${resetResult.success}, stderr="${resetResult.stderr}"`);
      
      if (!resetResult.success) {
        console.log(`[GitRollback] Reset failed: ${resetResult.stderr}`);
        return JSON.stringify({
          error: `Failed to reset to commit: ${resetResult.stderr}`
        });
      }
      
      console.log(`[GitRollback] Rollback successful to commit ${commitHash.substring(0, 8)}`);
      return JSON.stringify({
        success: true,
        snapshotId: params.snapshotId,
        commitHash,
        reset: 'hard',
        message: `Rolled back to snapshot ${params.snapshotId} (commit ${commitHash.substring(0, 8)})`
      });
    }
    
    // Reset to tag
    console.log(`[GitRollback] Resetting to tag: ${tagName}`);
    const resetResult = executeGitCommand(['reset', '--hard', tagName], root);
    console.log(`[GitRollback] Reset result: success=${resetResult.success}, stderr="${resetResult.stderr}"`);
    
    if (!resetResult.success) {
      console.log(`[GitRollback] Reset to tag failed: ${resetResult.stderr}`);
      return JSON.stringify({
        error: `Failed to reset to tag: ${resetResult.stderr}`
      });
    }
    
    console.log(`[GitRollback] Rollback successful to tag ${tagName}`);
    
    // Refresh VS Code workspace to show the changes
    try {
      const folders = vscode.workspace.workspaceFolders;
      if (folders && folders.length > 0) {
        vscode.commands.executeCommand('workbench.files.action.refreshFilesExplorer');
        console.log(`[GitRollback] Refreshed workspace explorer`);
      }
    } catch (refreshError) {
      console.warn(`[GitRollback] Failed to refresh workspace: ${refreshError}`);
      // Continue anyway, as the Git operation succeeded
    }
    
    return JSON.stringify({
      success: true,
      snapshotId: params.snapshotId,
      gitTag: tagName,
      reset: 'hard',
      message: `Rolled back to snapshot ${params.snapshotId} (tag ${tagName})`
    });
  } catch (e: any) {
    console.log(`[GitRollback] Exception: ${e.message}`);
    return JSON.stringify({
      error: `Failed to rollback: ${e.message}`
    });
  }
}

export function listGitSnapshotsTool(): string {
  try {
    const root = getWorkspaceRoot();
    ensureGitRepository();
    
    // List all vibe snapshot tags
    const tagResult = executeGitCommand(['tag', '-l', 'vibe-snapshot-*'], root);
    if (!tagResult.success) {
      return JSON.stringify({
        error: `Failed to list tags: ${tagResult.stderr}`
      });
    }
    const tags = tagResult.stdout.trim().split('\n').map(t => t.trim()).filter(tag => tag);
    const snapshots = [];
    for (const tag of tags) {
      // Use 'git log -1' instead of 'git show' to avoid annotated-tag header
      // appearing before the format output and corrupting the parsed fields.
      const showResult = executeGitCommand(['log', '-1', '--format=%H|%ct|%s|%b', tag], root);
      if (showResult.success) {
        const output = showResult.stdout.trim();
        // The format is: <hash>|<timestamp>|<subject>|<body…>
        // Split only on the first 3 '|' so the body (which may contain '|') is kept intact.
        const firstPipe  = output.indexOf('|');
        const secondPipe = output.indexOf('|', firstPipe + 1);
        const thirdPipe  = output.indexOf('|', secondPipe + 1);
        const hash      = output.slice(0, firstPipe);
        const timestamp = output.slice(firstPipe + 1, secondPipe);
        const subject   = output.slice(secondPipe + 1, thirdPipe);
        const body      = thirdPipe >= 0 ? output.slice(thirdPipe + 1) : '';

        // Extract "User instruction: ..." from commit body
        const instrMatch = body.match(/^User instruction:\s*(.+)/m);
        const userInstruction = instrMatch ? instrMatch[1].replace(/\.\.\.$/,'').trim() : subject;

        // Tag format: vibe-snapshot-<sessionId>-snapshot-<timestamp>-<hash>
        const withoutPrefix = tag.slice('vibe-snapshot-'.length);
        const snapshotKeyword = '-snapshot-';
        const snapshotIdx = withoutPrefix.indexOf(snapshotKeyword);
        const sessionId   = snapshotIdx >= 0 ? withoutPrefix.slice(0, snapshotIdx) : withoutPrefix;
        const snapshotId  = snapshotIdx >= 0 ? withoutPrefix.slice(snapshotIdx + 1) : ''; // +1 to skip the '-'

        snapshots.push({
          tag,
          sessionId,
          snapshotId,
          commitHash: hash,
          timestamp: parseInt(timestamp, 10) * 1000,
          subject,
          userInstruction,
        });
      }
    }
    
    return JSON.stringify({
      success: true,
      snapshots,
      total: snapshots.length,
      message: `Found ${snapshots.length} Git snapshots`
    });
    
  } catch (e: any) {
    return JSON.stringify({
      error: `Failed to list snapshots: ${e.message}`
    });
  }
}