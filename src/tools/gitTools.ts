import * as vscode from 'vscode';
import { getWorkspaceRoot } from '../utils/pathHelpers';

// ─── Git integration functions ─────────────────────────────────────────────────

function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).substring(0, 8);
}

function generateSnapshotId(userInstruction: string): string {
  const timestamp = Date.now();
  const hash = simpleHash(userInstruction);
  return 'snapshot-' + timestamp + '-' + hash;
}

function executeGitCommand(args: string[], cwd: string): {success: boolean; stdout: string; stderr: string} {
  try {
    const { execFileSync } = require('child_process');
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
    const root = getWorkspaceRoot();
    ensureGitRepository();

    const statusResult = executeGitCommand(['status', '--porcelain'], root);
    if (!statusResult.success) {
      return JSON.stringify({
        error: 'Failed to get Git status: ' + statusResult.stderr
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

    const snapshotId = generateSnapshotId(params.userInstruction);
    const commitMessage = 'OpenVibe snapshot: ' + snapshotId + '\n\nUser instruction: ' + params.userInstruction.substring(0, 100) + (params.userInstruction.length > 100 ? '...' : '');

    const addResult = executeGitCommand(['add', '.'], root);
    if (!addResult.success) {
      return JSON.stringify({
        error: 'Failed to stage changes: ' + addResult.stderr
      });
    }

    const commitResult = executeGitCommand(['commit', '-m', commitMessage], root);
    if (!commitResult.success) {
      return JSON.stringify({
        error: 'Failed to create commit: ' + commitResult.stderr
      });
    }

    const hashResult = executeGitCommand(['rev-parse', 'HEAD'], root);
    if (!hashResult.success) {
      return JSON.stringify({
        error: 'Failed to get commit hash: ' + hashResult.stderr
      });
    }

    const commitHash = hashResult.stdout.trim();

    const tagName = 'vibe-snapshot-' + params.sessionId + '-' + snapshotId;
    const tagResult = executeGitCommand(['tag', '-a', tagName, '-m', 'Snapshot: ' + snapshotId], root);

    return JSON.stringify({
      success: true,
      snapshotId,
      commitHash,
      gitTag: tagResult.success ? tagName : undefined,
      message: 'Created Git snapshot ' + snapshotId + ' for user instruction',
      hasChanges: true
    });

  } catch (e: any) {
    return JSON.stringify({
      error: 'Failed to create Git snapshot: ' + e.message
    });
  }
}

export function gitRollbackTool(params: GitRollbackParams): string {
  try {
    const root = getWorkspaceRoot();
    ensureGitRepository();

    const tagName = 'vibe-snapshot-' + params.sessionId + '-' + params.snapshotId;

    const tagCheck = executeGitCommand(['show-ref', '--tags', tagName], root);

    if (!tagCheck.success || !tagCheck.stdout.trim()) {
      const logResult = executeGitCommand(['log', '--all', '--grep', params.snapshotId, '--oneline', '-1'], root);
      if (!logResult.success || !logResult.stdout.trim()) {
        return JSON.stringify({
          error: 'Snapshot not found: ' + params.snapshotId
        });
      }

      const commitHash = logResult.stdout.split(' ')[0];

      if (!commitHash) {
        return JSON.stringify({
          error: 'Could not find commit for snapshot: ' + params.snapshotId
        });
      }

      const resetResult = executeGitCommand(['reset', '--hard', commitHash], root);

      if (!resetResult.success) {
        return JSON.stringify({
          error: 'Failed to reset to commit: ' + resetResult.stderr
        });
      }

      return JSON.stringify({
        success: true,
        snapshotId: params.snapshotId,
        commitHash,
        reset: 'hard',
        message: 'Rolled back to snapshot ' + params.snapshotId + ' (commit ' + commitHash.substring(0, 8) + ')'
      });
    }

    const resetResult = executeGitCommand(['reset', '--hard', tagName], root);

    if (!resetResult.success) {
      return JSON.stringify({
        error: 'Failed to reset to tag: ' + resetResult.stderr
      });
    }

    try {
      const folders = vscode.workspace.workspaceFolders;
      if (folders && folders.length > 0) {
        vscode.commands.executeCommand('workbench.files.action.refreshFilesExplorer');
      }
    } catch (refreshError) {
      console.warn('[GitRollback] Failed to refresh workspace: ' + refreshError);
    }

    return JSON.stringify({
      success: true,
      snapshotId: params.snapshotId,
      gitTag: tagName,
      reset: 'hard',
      message: 'Rolled back to snapshot ' + params.snapshotId + ' (tag ' + tagName + ')'
    });
  } catch (e: any) {
    return JSON.stringify({
      error: 'Failed to rollback: ' + e.message
    });
  }
}

export function listGitSnapshotsTool(): string {
  try {
    const root = getWorkspaceRoot();
    ensureGitRepository();

    const tagResult = executeGitCommand(['tag', '-l', 'vibe-snapshot-*'], root);
    if (!tagResult.success) {
      return JSON.stringify({
        error: 'Failed to list tags: ' + tagResult.stderr
      });
    }
    const tags = tagResult.stdout.trim().split(/\r?\n/).map(t => t.trim()).filter(tag => tag);
    const snapshots = [];
    for (const tag of tags) {
      const showResult = executeGitCommand(['log', '-1', '--format=%H|%ct|%s|%b', tag], root);
      if (showResult.success) {
        const output = showResult.stdout.trim();
        const firstPipe  = output.indexOf('|');
        const secondPipe = output.indexOf('|', firstPipe + 1);
        const thirdPipe  = output.indexOf('|', secondPipe + 1);
        const hash      = output.slice(0, firstPipe);
        const timestamp = output.slice(firstPipe + 1, secondPipe);
        const subject   = output.slice(secondPipe + 1, thirdPipe);
        const body      = thirdPipe >= 0 ? output.slice(thirdPipe + 1) : '';

        const instrMatch = body.match(/^User instruction:\s*(.+)/m);
        const userInstruction = instrMatch ? instrMatch[1].replace(/\.\.\.$/,'').trim() : subject;

        const withoutPrefix = tag.slice('vibe-snapshot-'.length);
        const snapshotKeyword = '-snapshot-';
        const snapshotIdx = withoutPrefix.indexOf(snapshotKeyword);
        const sessionId   = snapshotIdx >= 0 ? withoutPrefix.slice(0, snapshotIdx) : withoutPrefix;
        const snapshotId  = snapshotIdx >= 0 ? withoutPrefix.slice(snapshotIdx + 1) : '';

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
      message: 'Found ' + snapshots.length + ' Git snapshots'
    });

  } catch (e: any) {
    return JSON.stringify({
      error: 'Failed to list snapshots: ' + e.message
    });
  }
}
