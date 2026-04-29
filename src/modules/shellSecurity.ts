import type { ShellReviewAgentResult } from './shellCommandReview';

/**
 * Check if a shell command attempts to write/modify workspace files,
 * which should instead use the edit/create_directory tools.
 */
export function detectShellFileOpBypass(command: string): string | null {
  const c = command.trim();
  // Obvious shell write/edit primitives (cross-shell).
  if (/(^|[;&|])\s*(sed|perl|python|node)\b/i.test(c) && /-i\b/.test(c)) {
    return 'Detected in-place editing via scripting tool (e.g. sed -i / perl -pi). Use read_file + edit instead.';
  }
  if (/(^|[;&|])\s*(tee)\b/i.test(c)) {
    return 'Detected tee-based file writes. Use read_file + edit instead.';
  }
  if (/[^\S\r\n]>\s*\S/.test(c) || /[^\S\r\n]>>\s*\S/.test(c)) {
    return 'Detected output redirection (>, >>). Do not write files via shell; use edit/create_directory tools.';
  }
  // PowerShell write primitives.
  if (/\b(Set-Content|Add-Content|Out-File)\b/i.test(c)) {
    return 'Detected PowerShell file write command. Use read_file + edit instead.';
  }
  // Common batch editors.
  if (/\b(vim|nvim|nano)\b/i.test(c)) {
    return 'Detected interactive editor usage. Use read_file + edit tools instead.';
  }
  return null;
}

/**
 * Check if a shell command attempts to read workspace contents,
 * which should instead use read_file / find_in_file / get_workspace_info.
 */
export function detectShellContextHarvest(command: string): string | null {
  const c = command.trim();
  // Read/show file contents.
  const readCmd = /\b(cat|type|more|less|head|tail|Get-Content)\b/i;
  if (readCmd.test(c)) {
    // Allow reading a single, clearly non-code file when scoped (no pipes) and not under src/.
    const m = c.match(/\b(?:cat|type|more|less|head|tail|Get-Content)\b\s+("?)([^\s"|;&]+)\1/i);
    const rawPath = (m?.[2] ?? '').trim();
    const pathLower = rawPath.replace(/^["']|["']$/g, '').toLowerCase();
    const ext = pathLower.includes('.') ? pathLower.slice(pathLower.lastIndexOf('.')) : '';
    const isInSrc = /(^|[\\/])src[\\/]/i.test(pathLower);
    const hasPipe = /[|]/.test(c);
    const allowedNonCodeExt = new Set([
      '.md', '.txt', '.log', '.csv', '.tsv',
      '.json', '.yaml', '.yml', '.toml',
      '.ini', '.cfg', '.conf',
    ]);
    const disallowedCodeExt = new Set([
      '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
      '.py', '.java', '.cs', '.go', '.rs',
      '.cpp', '.c', '.h', '.hpp', '.sh', '.ps1', '.bat', '.cmd',
    ]);
    const isEnv = ext === '.env' || pathLower.endsWith('.env.local') || pathLower.endsWith('.env.production');

    if (!hasPipe && rawPath && !isInSrc && !isEnv && (allowedNonCodeExt.has(ext) || (ext && !disallowedCodeExt.has(ext)))) {
      return null;
    }
    return 'Shell read of workspace files is restricted. Prefer read_file. If you must read via shell, keep it to a single non-code artifact (e.g. .log/.txt) outside src/ with no pipes.';
  }
  // Workspace enumeration/search (especially recursive).
  if (/\b(dir|ls|tree|Get-ChildItem)\b/i.test(c) && /\b(-Recurse|\/s)\b/i.test(c)) {
    return 'Command appears to recursively enumerate the workspace via shell. Use get_workspace_info / read_file / find_in_file instead.';
  }
  if (/\b(find|grep|rg|Select-String)\b/i.test(c)) {
    return 'Command appears to search files via shell. Use find_in_file instead.';
  }
  // Non-recursive listing can still be context-harvesting; treat as disallowed under current policy.
  if (/\b(dir|ls|tree|Get-ChildItem)\b/i.test(c)) {
    return 'Command appears to enumerate workspace files via shell. Use get_file_info + read_file instead (and prefer adding a dedicated tool if directory listing is needed).';
  }
  return null;
}

/**
 * Determine if a failed shell review should cause early stop (avoid retry loops).
 * Returns true when the reviewer indicates the action is fundamentally inappropriate for shell.
 */
export function shouldEarlyStopOnShellReviewFail(review: ShellReviewAgentResult): boolean {
  if (review.decision === 'PASS') return false;
  const text = `${review.summary || ''}\n${(review.notes || []).join('\n')}`.toLowerCase();
  return (
    text.includes('no-shell-for-context') ||
    text.includes('use read_file') ||
    text.includes('use find_in_file') ||
    text.includes('use edit') ||
    text.includes('do not use shell') ||
    text.includes('do not approve a shell workaround') ||
    text.includes('enumerate') ||
    text.includes('view/search/harvest') ||
    text.includes('shell-based file edits') ||
    text.includes('edit-tool bypass')
  );
}
