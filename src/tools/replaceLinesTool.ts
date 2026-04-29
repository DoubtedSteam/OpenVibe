import * as fs from 'fs';
import * as path from 'path';
import {
  resolveWorkspacePath,
  readLines,
  writeLines,
  splitLinesForEditInput,
  splitLinesNormalized,
  inferCrlfForNewFile,
} from '../utils/pathHelpers';

export interface ReplaceParams {
  filePath: string;
  startLine: number;
  endLine: number;
  newContent: string;
}

export interface ReplaceCheckContext {
  filePath: string;
  startLine: number;
  endLine: number;
  beforeContext: string;
  afterContext: string;
  unifiedDiff: string;
}

export interface ReplaceCheckResult {
  ok: boolean;
  reason?: string;
  notes?: string[];
}

export async function replaceLinesTool(
  params: ReplaceParams,
  llmCheckFn: (ctx: ReplaceCheckContext) => Promise<ReplaceCheckResult>,
  userConfirmFn?: (ctx: ReplaceCheckContext) => Promise<boolean>
): Promise<string> {
  let absPath: string;
  try {
    absPath = resolveWorkspacePath(params.filePath);
  } catch (e: any) {
    return JSON.stringify({ error: e.message });
  }

  const existedBefore = fs.existsSync(absPath);
  if (existedBefore) {
    const stat = fs.statSync(absPath);
    if (stat.isDirectory()) {
      return JSON.stringify({ error: `Cannot replace a directory: ${params.filePath}` });
    }
  }

  let lines: string[] = [];
  let crlf = process.platform === 'win32';
  let total = 0;

  if (!existedBefore) {
    if (params.startLine !== 1) {
      return JSON.stringify({
        error: `Cannot create new file: startLine must be 1 for new files (got ${params.startLine})`
      });
    }
    if (params.endLine !== 0) {
      return JSON.stringify({
        error: `Cannot create new file: endLine must be 0 for new files (got ${params.endLine})`
      });
    }
  } else {
    const result = readLines(absPath);
    lines = result.lines;
    crlf = result.crlf;
    total = lines.length;
  }

  if (!fs.existsSync(absPath)) {
    crlf = inferCrlfForNewFile(params.newContent);
  }

  if (params.startLine < 1 || params.startLine > total + 1) {
    return JSON.stringify({ error: `startLine ${params.startLine} is out of range (file has ${total} lines)` });
  }
  const clampedEnd = Math.min(Math.max(params.startLine - 1, params.endLine), total);

  const oldLines = lines.slice(params.startLine - 1, clampedEnd);
  const newLines = splitLinesForEditInput(params.newContent);

  if (existedBefore && oldLines.length === newLines.length) {
    let same = true;
    for (let i = 0; i < oldLines.length; i++) {
      if (oldLines[i] !== newLines[i]) {
        same = false;
        break;
      }
    }
    if (same) {
      return JSON.stringify({
        success: true,
        noChanges: true,
        totalLines: total,
        linesDelta: 0,
        message: `No changes: replacement content is identical for lines ${params.startLine} - ${clampedEnd}.`,
      });
    }
  }

  // Build context windows (+-10 lines)
  const CTX = 10;
  const isNewFile = total === 0 && !fs.existsSync(absPath);

  let beforeContext: string;
  if (isNewFile) {
    beforeContext = "   (New file, no content yet)";
  } else {
    const ctxStart = Math.max(1, params.startLine - CTX);
    const ctxEnd   = Math.min(total, clampedEnd + CTX);
    beforeContext = lines
      .slice(ctxStart - 1, ctxEnd)
      .map((l, i) => {
        const ln = ctxStart + i;
        const inRange = ln >= params.startLine && ln <= clampedEnd;
        return (inRange ? '>>>' : '   ') + ' ' + ln + ': ' + l;
      })
      .join('\n');
  }

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
        return '>>> ' + ln + ': ' + l;
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
        return (inRange ? '>>>' : '   ') + ' ' + ln + ': ' + l;
      })
      .join('\n');
  }

  // Unified diff
  const unifiedDiffLines: string[] = [];
  if (oldLines.length === 0 && newLines.length === 0) {
    unifiedDiffLines.push('(no changes)');
  } else {
    for (let i = 0; i < oldLines.length; i++) {
      const ln = params.startLine + i;
      unifiedDiffLines.push('- ' + ln + ': ' + oldLines[i]);
    }
    for (let i = 0; i < newLines.length; i++) {
      const ln = params.startLine + i;
      unifiedDiffLines.push('+ ' + ln + ': ' + newLines[i]);
    }
  }
  const unifiedDiff = unifiedDiffLines.join('\n');

  const diffMeta = {
    filePath: params.filePath,
    startLine: params.startLine,
    endLine: clampedEnd,
    unifiedDiff,
  };

  // LLM secondary confirmation
  const check = await llmCheckFn({
    filePath: params.filePath,
    startLine: params.startLine,
    endLine: clampedEnd,
    beforeContext,
    afterContext,
    unifiedDiff,
  });

  if (!check.ok) {
    return JSON.stringify({
      success: false,
      message: 'LLM check rejected the replacement - operation cancelled',
      reviewReason: check.reason ?? '',
      reviewNotes: Array.isArray(check.notes) ? check.notes : [],
      ...diffMeta,
    });
  }

  // Show diff editor before user confirmation
  if (userConfirmFn && existedBefore) {
    const langId = path.extname(params.filePath).slice(1) || 'plaintext';
    try {
      const vscodeMod = require('vscode');
      const leftContent = existedBefore ? lines.join('\n') : '';
      const rightContent = afterLines.join('\n');
      const leftDoc = await vscodeMod.workspace.openTextDocument({ content: leftContent, language: langId });
      const rightDoc = await vscodeMod.workspace.openTextDocument({ content: rightContent, language: langId });
      await vscodeMod.commands.executeCommand(
        'vscode.diff',
        leftDoc.uri,
        rightDoc.uri,
        'Edit: ' + params.filePath,
        { preview: true }
      );
    } catch {
      // diff display failure should not block flow
    }
  }

  if (userConfirmFn) {
    const userApproved = await userConfirmFn({
      filePath: params.filePath,
      startLine: params.startLine,
      endLine: clampedEnd,
      beforeContext,
      afterContext,
      unifiedDiff,
    });
    try {
      const vscodeMod = require('vscode');
      await vscodeMod.commands.executeCommand('workbench.action.closeActiveEditor');
    } catch {
      // closing failure should not block
    }
    if (!userApproved) {
      return JSON.stringify({
        success: false,
        message: 'User rejected the replacement - operation cancelled',
        ...diffMeta,
      });
    }
  }

  // Apply the change
  writeLines(absPath, afterLines, crlf);

  const newTotal = afterLines.length;
  const diagnosticsInfo = { hasNewDiagnostics: false, count: 0, diagnostics: [] };

  return JSON.stringify({
    success: true,
    totalLines: newTotal,
    linesDelta: newTotal - total,
    message: 'Replaced lines ' + params.startLine + '-' + clampedEnd + ': removed ' + oldLines.length + ', added ' + newLines.length + '. File now has ' + newTotal + ' lines.',
    lineRangeStaleHint:
      'Before another edit on this file, call read_file again: line numbers from prior reads are outdated after this change.',
    diagnosticsCheck: diagnosticsInfo,
    ...diffMeta,
  });
}
