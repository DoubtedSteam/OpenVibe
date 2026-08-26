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
  unifiedDiff: string;
}

export interface ReplaceCheckResult {
  ok: boolean;
  reason?: string;
  notes?: string[];
}

/**
 * Replace a range of lines in a file with new content (the core "edit" operation).
 *
 * Flow: LLM secondary review → VS Code diff editor preview → user confirm → write.
 * Supports creating new files (no prior read required) as well as modifying existing files.
 * Handles CRLF/LF line-ending detection automatically.
 *
 * @param params         The file path and the line range to replace.
 * @param llmCheckFn     Independent LLM review callback for code-level consistency check.
 * @param userConfirmFn  Optional user confirmation dialog (diff preview).
 * @returns JSON string with `{ success: true }` or `{ error: string }`.
 */
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

  // Build a unified diff with +/-3 context lines — single view shared by the
  // LLM review, the webview diff preview, and the tool result.
  const CTX = 3;
  const isNewFile = total === 0 && !fs.existsSync(absPath);

  const afterLines = [
    ...lines.slice(0, params.startLine - 1),
    ...newLines,
    ...lines.slice(clampedEnd),
  ];

  const unifiedDiffLines: string[] = [];
  if (oldLines.length === 0 && newLines.length === 0) {
    unifiedDiffLines.push('(no changes)');
  } else {
    if (!isNewFile) {
      // Context lines before the change (original file line numbers)
      const ctxStart = Math.max(1, params.startLine - CTX);
      for (let ln = ctxStart; ln < params.startLine; ln++) {
        unifiedDiffLines.push('   ' + ln + ': ' + lines[ln - 1]);
      }
    }
    for (let i = 0; i < oldLines.length; i++) {
      unifiedDiffLines.push('- ' + (params.startLine + i) + ': ' + oldLines[i]);
    }
    for (let i = 0; i < newLines.length; i++) {
      unifiedDiffLines.push('+ ' + (params.startLine + i) + ': ' + newLines[i]);
    }
    // Context lines after the change (new file line numbers)
    const afterStartIdx = (params.startLine - 1) + newLines.length;
    for (let i = 0; i < CTX && afterStartIdx + i < afterLines.length; i++) {
      unifiedDiffLines.push('   ' + (params.startLine + newLines.length + i) + ': ' + afterLines[afterStartIdx + i]);
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
    unifiedDiff,
  });

  if (!check.ok) {
    return JSON.stringify({
      success: false,
      operation: 'edit_rejected',
      reviewReason: check.reason ?? '',
      reviewNotes: Array.isArray(check.notes) ? check.notes : [],
      filePath: params.filePath,
      targetRange: `第 ${params.startLine}-${clampedEnd} 行`,
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
        operation: 'edit_rejected',
        reason: 'User rejected the replacement',
        filePath: params.filePath,
        targetRange: `第 ${params.startLine}-${clampedEnd} 行`,
      });
    }
  }

  // Apply the change
  writeLines(absPath, afterLines, crlf);

  const newTotal = afterLines.length;
  return JSON.stringify({
    success: true,
    totalLines: newTotal,
    linesDelta: newTotal - total,
    message: 'Replaced lines ' + params.startLine + '-' + clampedEnd + ': removed ' + oldLines.length + ', added ' + newLines.length + '. File now has ' + newTotal + ' lines.',
    lineRangeStaleHint:
      'Before another edit on this file, call read_file again: line numbers from prior reads are outdated after this change.',
    ...diffMeta,
  });
}
