// ─── tools/index.ts ─────────────────────────────────────────────────────────
// Re-exports all public tool interfaces and functions previously in tools.ts.
// Each tool category is now in its own file under src/tools/.

// Helpers (skills, activation callbacks)
export { setGlobalSkillsDir, setActivatedSkillsCallbacks } from './helpers';

// read_file
export type { ReadFileParams } from './readFileTool';
export { readFileTool } from './readFileTool';

// find_in_file
export type { FindParams } from './findInFileTool';
export { findInFileTool } from './findInFileTool';

// get_workspace_info, create_directory, get_diagnostics, get_file_info
export type { CreateDirectoryParams, GetDiagnosticsParams, GetFileInfoParams } from './workspaceTools';
export { getWorkspaceInfoTool, createDirectoryTool, getDiagnosticsTool, getFileInfoTool } from './workspaceTools';

// replace_lines
export type { ReplaceParams, ReplaceCheckContext, ReplaceCheckResult } from './replaceLinesTool';
export { replaceLinesTool } from './replaceLinesTool';

// show_notification, ask_human
export type { ShowNotificationParams, AskHumanParams } from './notificationTools';
export { showNotificationTool, askHumanTool } from './notificationTools';

// run_shell_command
// run_shell_command
export type { RunShellCommandParams } from './shellTool';
export { runShellCommandTool } from './shellTool';

// get_terminal_content — read output from user's VS Code terminals
export type { GetTerminalContentParams } from './terminalTool';
export { getTerminalContentTool, activateTerminalTracking } from './terminalTool';

// Git snapshot / rollback
export type { GitSnapshotParams, GitRollbackParams } from './gitTools';
export { gitSnapshotTool, gitRollbackTool, listGitSnapshotsTool } from './gitTools';

// Skill system
export type { SkillLoadParams } from './skillTools';
export { listSkillsTool, loadSkillTool, activateSkillTool, deactivateSkillTool, listActivatedSkillsTool, loadActivatedSkillInstruction } from './skillTools';

// web_fetch
export { webFetchTool } from './webFetchTool';

// grep_search
export type { GrepSearchParams } from './grepSearchTool';
export { grepSearchTool } from './grepSearchTool';

// browser_sub_agent
export type { BrowserSubAgentParams } from './browserAgentTool';
export { browserSubAgentTool } from './browserAgentTool';

// Backward-compat re-export (imported by ToolExecutor et al.)
export { workspaceFileExistsRelative } from '../utils/pathHelpers';
