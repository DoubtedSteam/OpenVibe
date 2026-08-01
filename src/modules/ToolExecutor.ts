import * as fs from 'fs';
import { resolveWorkspacePath } from '../utils/pathHelpers';

import * as path from 'path';
import {
  readFileTool,
  findInFileTool,
  replaceLinesTool,
  getWorkspaceInfoTool,
  createDirectoryTool,
  getDiagnosticsTool,
  getFileInfoTool,
  showNotificationTool,
  askHumanTool,
  runShellCommandTool,
  gitSnapshotTool,
  gitRollbackTool,
  listGitSnapshotsTool,
  workspaceFileExistsRelative,
  listSkillsTool,
  loadSkillTool,
  webFetchTool,
  grepSearchTool,
  browserSubAgentTool,
  getTerminalContentTool,
} from '../tools';
import type { ReplaceCheckContext, ReplaceCheckResult } from '../tools';
import type { ApiConfig, AgentLogEntry, AssistantTodoPersistedState } from '../types';
import type { TodolistReviewSettings, TodoState } from './todolistReview';
import {
  applyExpandToClone,
  editorExpandCandidate,
  loadMemoryExcerpt,
  mergeReviewNotes,
  regenerateGenerateCandidate,
  reviewTodolistEdit,
  reviewTodolistGenerate,
} from './todolistReview';
import type { ShellCommandReviewSettings, ShellReviewAgentResult } from './shellCommandReview';
import { reviewShellCommand } from './shellCommandReview';
import {
  detectShellFileOpBypass,
  detectShellContextHarvest,
  shouldEarlyStopOnShellReviewFail,
} from './shellSecurity';
import { TodoListManager } from './todoListManager';


export class ToolExecutor {
  private _todoListManager = new TodoListManager();
  private _lastShellExecutions: { command: string; at: number; summary: string; success: boolean }[] = [];

  /** Edit permission state - controls whether edit tools can be used */
  private _editPermissionEnabled: boolean = true;

  /** Increments per `edit` LLM check in the current user turn (shown on Replace check cards). */
  private _editReviewRound = 0;

  /**
   * Per file path: read_file or find_in_file (match) has run since last user message / invalidation,
   * so line numbers are considered current for enforcing edit order.
   */
  private _lineQueryFresh = new Map<string, boolean>();

  /** Tracks file paths modified via the `edit` tool in the current user-turn session. */
  private _sessionEditedFiles = new Set<string>();

  /** Cache of file content BEFORE each edit (normalized path → full text), for "Open in Diff Editor". */
  private _editBeforeSnapshots = new Map<string, string>();

  /** Return the cached pre-edit content for a file, or null if it was never edited this session. */
  public getEditBeforeSnapshot(filePath: string): string | null {
    return this._editBeforeSnapshots.get(this._normalizeFileKey(filePath)) ?? null;
  }

  /** Tools blocked in the current sub-agent scope. Empty = all tools allowed. */
  private _blockedTools: Set<string> = new Set();

  /** Configure which tools are forbidden in the current sub-agent scope. */
  public setBlockedTools(tools: string[]): void {
    this._blockedTools = new Set(tools);
  }

  constructor(
     private readonly _context: {
       post: (message: any) => void;
       /** Persist assistant-only UI lines (todo/shell/review) so webview reload can replay them. */
       persistAssistantUiEcho: (content: string) => void;
       /** Persist todo list state per session so reload restores `getTodoControlInfo`. */
       persistAssistantTodoState: (state: TodoState | null) => void;
       llmCheckReplace: (ctx: ReplaceCheckContext) => Promise<ReplaceCheckResult>;
       userConfirmReplace: (ctx: ReplaceCheckContext) => Promise<boolean>;
       userConfirmShellCommand: (command: string) => Promise<boolean>;
       /** Ask human: show a dialog and wait for user to click Done/Cancel. */
       userConfirmHumanAssistance: (question: string) => Promise<{ approved: boolean; userMessage?: string }>;
       getApiConfig: () => ApiConfig;
       getLastUserTextForTools: () => string;
       getRelatedContextForTodolistReview: () => string;
       getTodolistReviewSettings: () => TodolistReviewSettings;
       getShellCommandReviewSettings: () => ShellCommandReviewSettings;
       /** Check if edit permission is enabled */
       getEditPermissionEnabled: () => boolean;
       /** Update edit permission state */
       setEditPermissionEnabled: (enabled: boolean) => void;
       isStopped?: () => boolean;
       signal?: () => AbortSignal;
       log?: (entry: AgentLogEntry) => void;
     }
   ) {
    this._todoListManager.wireCallbacks(
      (state) => this._context.persistAssistantTodoState(state),
      (content) => this._context.persistAssistantUiEcho(content),
    );
  }

  private _stopped(): boolean {
    return this._context.isStopped?.() ?? false;
  }

  private _signal(): AbortSignal | undefined {
    try {
      return this._context.signal?.();
    } catch {
      return undefined;
    }
  }

  private _log(agent: string, stage: string, data: any): void {
    try {
      this._context.log?.({ at: Date.now(), agent, stage, data });
    } catch {
      // ignore
    }
  }

  private _postUiEcho(content: string): void {
    this._context.persistAssistantUiEcho(content);
  }

  private _notifyTodoPersisted(): void {
    this._todoListManager._notifyPersisted();
  }

  /** Restore todo state from workspace session file after extension / window reload. */
  public restorePersistedTodoState(state: AssistantTodoPersistedState | null): void {
    this._todoListManager.restorePersistedTodoState(state);
  }

  /**
   * Call when the user sends a new message (not empty "continue") so edit check numbering restarts
   * and line-query gates are cleared (each edit must be preceded by read_file / find_in_file again).
   */
  public resetReviewUiCounters(): void {
    this._editReviewRound = 0;
    this._lineQueryFresh.clear();
    this._sessionEditedFiles.clear();
  }

  private _normalizeFileKey(filePath: string): string {
    return path.normalize(filePath.trim()).replace(/\\/g, '/');
  }

  private _markLineQueryFresh(filePath: string): void {
    this._lineQueryFresh.set(this._normalizeFileKey(filePath), true);
  }

  private _invalidateLineQuery(filePath: string): void {
    this._lineQueryFresh.delete(this._normalizeFileKey(filePath));
  }

  private _isLineQueryFresh(filePath: string): boolean {
    return this._lineQueryFresh.get(this._normalizeFileKey(filePath)) === true;
  }

  /** Next sequence number for Replace check cards this turn. */
  public nextEditReviewRound(): number {
    this._editReviewRound += 1;
    return this._editReviewRound;
  }

  /** Returns the list of file paths modified via `edit` in the current user-turn session. */
  public getSessionEditedFiles(): string[] {
    return Array.from(this._sessionEditedFiles).sort();
  }

  /** Clears the tracked edited files list. */
  public clearSessionEditedFiles(): void {
    this._sessionEditedFiles.clear();
  }


   public async executeTool(name: string, args: Record<string, unknown>): Promise<string> {
     // Check if the tool is blocked in the current sub-agent scope
     if (this._blockedTools.size > 0 && this._blockedTools.has(name)) {
       return JSON.stringify({ error: `Tool "${name}" is not available in the current sub-agent scope.` });
     }

     // Check if the tool requires edit permission
     const editTools = ['edit', 'create_directory'];
     if (editTools.includes(name) && !this._context.getEditPermissionEnabled()) {
       const message = `Edit permission is currently disabled. The ${name} tool cannot be used while edit permission is turned off. Please enable edit permission or use read-only tools only.`;
       this._postUiEcho(message);
       return JSON.stringify({ error: message });
     }

     switch (name) {
      case 'get_workspace_info':
        return getWorkspaceInfoTool();

      case 'read_file': {
        const fp = args.filePath as string;
        const result = readFileTool({
          filePath: fp,
          startLine: args.startLine as number | undefined,
          endLine: args.endLine as number | undefined,
        });
        try {
          const o = JSON.parse(result) as { error?: string };
          if (!o.error) {
            this._markLineQueryFresh(fp);
          }
        } catch {
          /* ignore */
        }
        return result;
      }

      case 'find_in_file': {
        const fp = args.filePath as string;
        const result = findInFileTool({
          filePath: fp,
          searchString: args.searchString as string,
          contextBefore: args.contextBefore as number | undefined,
          contextAfter: args.contextAfter as number | undefined,
          occurrence: args.occurrence as number | undefined,
        });
        try {
          const o = JSON.parse(result) as { error?: string; found?: boolean };
          if (!o.error && o.found === true) {
            this._markLineQueryFresh(fp);
          }
        } catch {
          /* ignore */
        }
        return result;
      }

      case 'edit': {
        const newContent = args.newContent as string;
        const fp = args.filePath as string;
        const existedBefore = workspaceFileExistsRelative(fp);
        // 空文件（0 字节）不要求先查询行号
        const isEmpty = existedBefore && fs.statSync(resolveWorkspacePath(fp)).size === 0;
        if (existedBefore && !isEmpty && !this._isLineQueryFresh(fp)) {
          return JSON.stringify({
            error:
              'edit blocked: you must call read_file or find_in_file (successful match) on this file first to obtain current line numbers. ' +
              'This is enforced at the start of each user message and again after each successful edit that changes the file. ' +
              '新建不存在的文件时可直接 edit；若文件已存在则必须先查询行号。',
          });
        }
        // Cache the current file content BEFORE the edit — used by "Open in Diff Editor"
        if (existedBefore) {
          try {
            const abs = resolveWorkspacePath(fp);
            if (fs.existsSync(abs)) {
              this._editBeforeSnapshots.set(this._normalizeFileKey(fp), fs.readFileSync(abs, 'utf-8'));
            }
          } catch {
            // Snapshot failure must never block the edit itself
          }
        }
        const result = await replaceLinesTool(
          {
            filePath: fp,
            startLine: args.startLine as number,
            endLine: args.endLine as number,
            newContent: newContent,
          },
          (ctx) => this._context.llmCheckReplace(ctx),
          this._context.getApiConfig().confirmChanges !== false ? (ctx) => this._context.userConfirmReplace(ctx) : undefined
        );
        try {
          const o = JSON.parse(result) as { success?: boolean };
          if (o.success === true) {
            // Next edit on this file must read_file / find_in_file again (strict gate).
            this._invalidateLineQuery(fp);
            // Track the modified file for the task-complete summary
            this._sessionEditedFiles.add(this._normalizeFileKey(fp));
          }
        } catch {
          /* ignore */
        }
        return result;
      }

      case 'create_directory':
        return createDirectoryTool({
          dirPath: args.dirPath as string,
          recursive: args.recursive as boolean | undefined,
        });

      case 'task_complete': {
        const summary = (args['summary'] as string) || '';
        if (summary.trim()) {
          this._postUiEcho(summary.trim());
        }
        // task_complete 在 MessageHandler 中被提前拦截处理，此处不会被执行
        return JSON.stringify({ success: true, message: 'Task marked complete.', _immediate_end: true });
      }

      case 'create_todo_list':
        return await this._handleCreateTodoList(args);

      case 'complete_todo_item': {
        const idx = args['index'] as number;
        const summary = (args['summary'] as string) || '';
        if (!this._todoListManager.hasList()) {
          return JSON.stringify({ error: 'No todo list exists. Call create_todo_list first.' });
        }
        const theList = this._todoListManager.getList()!;
        if (idx < 0 || idx >= theList.items.length) {
          return JSON.stringify({ error: `Index ${idx} is out of range (0–${theList.items.length - 1}).` });
        }
        this._todoListManager.markDone(idx);
        const list = this._todoListManager.postUpdateDisplay(this._todoListManager.getList()!.items);
        const remaining = this._todoListManager.getList()!.items.filter(i => !i.done).length;
        const result = JSON.stringify({
          success: true,
          message: summary ? `Item ${idx + 1} complete: ${summary}` : `Item ${idx + 1} marked complete.`,
          remaining,
          todoList: list,
        });
        this._notifyTodoPersisted();

        return result;
      }

      case 'advance_todo_item': {
        const info = this.getTodoControlInfo();
        if (!info) {
          return JSON.stringify({ error: 'No todo list exists. Call create_todo_list first.' });
        }
        if (info.remaining === 0) {
          return JSON.stringify({ error: 'All items are already complete.' });
        }
        const idx = info.firstPendingIndex;
        const summary = (args['summary'] as string) || '';
        this._todoListManager.markDone(idx);
        const updatedList = this._todoListManager.getList()!.items;
        this._todoListManager.postUpdateDisplay(updatedList);
        const remaining = updatedList.filter(i => !i.done).length;
        this._notifyTodoPersisted();
        return JSON.stringify({
          success: true,
          _advance: true,
          message: summary
            ? `Item ${idx + 1} complete: ${summary}. ${remaining} remaining.`
            : `Item ${idx + 1} marked complete. ${remaining} remaining.`,
          remaining,
        });
      }

      case 'get_diagnostics': {
        return getDiagnosticsTool({
          uri: args.uri as string | undefined,
          filePath: args.filePath as string | undefined,
        });
      }

      case 'get_file_info':
        return getFileInfoTool({ filePath: args.filePath as string });


      case 'show_notification':
        return showNotificationTool({
          message: args.message as string,
          severity: args.severity as 'info' | 'warning' | 'error' | undefined,
        });

      case 'ask_human':
        return await askHumanTool(
          { question: args.question as string },
          (q) => this._context.userConfirmHumanAssistance(q)
        );

      case 'run_shell_command':
        return await this._handleRunShellCommand(args);

      case 'git_snapshot': {
        return gitSnapshotTool({
          sessionId: args.sessionId as string,
          userInstruction: args.userInstruction as string,
          description: args.description as string | undefined,
        });
      }

      case 'git_rollback': {
        return gitRollbackTool({
          snapshotId: args.snapshotId as string,
          sessionId: args.sessionId as string,
        });
      }

      case 'list_git_snapshots': {
        return listGitSnapshotsTool();
      }

      case 'list_skills': {
        return listSkillsTool();
      }

      case 'load_skill': {
        return loadSkillTool({ name: args.name as string });
      }

      case 'web_fetch': {
        return webFetchTool({
          url: args.url as string,
          maxLength: args.maxLength as number | undefined,
          cookie: args.cookie as string | undefined,
          headers: args.headers as string | undefined,
          timeoutMs: args.timeoutMs as number | undefined,
        });
      }

      case 'grep_search': {
        return grepSearchTool({
          pattern: args.pattern as string,
          includePattern: args.includePattern as string | undefined,
          excludePattern: args.excludePattern as string | undefined,
          maxResults: args.maxResults as number | undefined,
          caseSensitive: args.caseSensitive as boolean | undefined,
        });
      }

      case 'browser_sub_agent': {
        const apiConfig = this._context.getApiConfig();
        if (!apiConfig.apiKey) {
          return JSON.stringify({
            success: false,
            summary: 'API key not configured',
            error: 'OPENVIBE_API_KEY is not set. The browser sub-agent requires an API key to make LLM calls.',
            steps: 0,
          });
        }
        return browserSubAgentTool(
          {
            task: args.task as string,
            url: args.url as string | undefined,
            timeoutMs: args.timeoutMs as number | undefined,
            maxSteps: args.maxSteps as number | undefined,
          },
          apiConfig,
          undefined
        );
      }
      case 'get_terminal_content': {
        return getTerminalContentTool({
          terminalName: args.terminalName as string | undefined,
          lines: args.lines as number | undefined,
        });
      }



      default:
        return JSON.stringify({ error: `Unknown tool: ${name}` });
    }
  }

  private async _handleRunShellCommand(args: Record<string, unknown>): Promise<string> {
    const proposedFromTool = String(args.command ?? '').trim();
    if (!proposedFromTool) {
      return JSON.stringify({ error: 'command is empty' });
    }
    if (this._stopped()) {
      return JSON.stringify({ success: false, operation: 'run_shell_command', error: 'Operation stopped by user.' });
    }

    const cfg = this._context.getShellCommandReviewSettings();
    const apiConfig = this._context.getApiConfig();
    const confirmShell = apiConfig.confirmShellCommand !== false;

    // If review disabled: direct user confirm → execute
    if (!cfg.enabled) {
      if (confirmShell) {
        const approved = await this._context.userConfirmShellCommand(proposedFromTool);
        if (!approved) {
          return JSON.stringify({ success: false, error: 'User cancelled shell command' });
        }
      }
      return await runShellCommandTool({ command: proposedFromTool });
    }

    // Fast preflight: reject commands that are policy-violating before calling LLM review
    const bypass = detectShellFileOpBypass(proposedFromTool);
    if (bypass) {
      return JSON.stringify({
        success: false,
        operation: 'run_shell_command',
        error: 'Shell command rejected (file operation via shell).',
        reviewNotesAccumulated: [bypass],
        originalToolCommand: proposedFromTool,
      });
    }
    const harvest = detectShellContextHarvest(proposedFromTool);
    if (harvest) {
      return JSON.stringify({
        success: false,
        operation: 'run_shell_command',
        error: 'Shell command rejected (no-shell-for-context).',
        reviewNotesAccumulated: [harvest],
        originalToolCommand: proposedFromTool,
      });
    }

    const recentShell =
      this._lastShellExecutions.length > 0
        ? `## Recent shell commands (most recent first)\n${this._lastShellExecutions
            .slice(0, 5)
            .map((x, i) => `${i + 1}. [${x.success ? 'OK' : 'FAIL'}] ${x.command}\n   → ${x.summary}`)
            .join('\n')}\n`
        : `## Recent shell commands\n(none)\n`;

    // Single review pass (code-edit-review style, no editor agent / no retry loop)
    if (this._stopped()) {
      return JSON.stringify({ success: false, operation: 'run_shell_command', error: 'Operation stopped by user.' });
    }

    this._log('shellReview', 'request', { command: proposedFromTool });
    let review: ShellReviewAgentResult;
    try {
      review = await reviewShellCommand({
        apiConfig,
        command: proposedFromTool,
        recentShell,
        reviewTimeoutMs: cfg.reviewTimeoutMs,
        signal: this._signal(),
        log: (e) => this._context.log?.(e),
      });
    } catch (e: any) {
      if (e?.name === 'AbortError' || this._stopped()) {
        return JSON.stringify({ success: false, operation: 'run_shell_command', error: 'Operation stopped by user.' });
      }
      return JSON.stringify({
        success: false,
        operation: 'run_shell_command',
        error: `Shell review agent failed: ${e?.message ?? String(e)}`,
      });
    }
    this._log('shellReview', 'response', { decision: review.decision, summary: review.summary, notes: review.notes });

    if (review.decision === 'PASS') {
      if (confirmShell) {
        if (this._stopped()) {
          return JSON.stringify({ success: false, operation: 'run_shell_command', error: 'Operation stopped by user.' });
        }
        const approved = await this._context.userConfirmShellCommand(proposedFromTool);
        if (!approved) {
          return JSON.stringify({ success: false, error: 'User cancelled shell command' });
        }
      }
      if (this._stopped()) {
        return JSON.stringify({ success: false, operation: 'run_shell_command', error: 'Operation stopped by user.' });
      }
      const execResult = await runShellCommandTool({ command: proposedFromTool });
      // Extract result summary for history tracking
      let execSummary = '';
      let execSuccess = false;
      try {
        const parsed = JSON.parse(execResult) as Record<string, unknown>;
        execSummary = typeof parsed.summary === 'string' ? parsed.summary : (parsed.success ? 'OK' : 'Failed');
        execSuccess = parsed.success === true;
      } catch {
        execSummary = '(parse error)';
      }
      this._lastShellExecutions.unshift({ command: proposedFromTool, at: Date.now(), summary: execSummary, success: execSuccess });
      if (this._lastShellExecutions.length > 20) {
        this._lastShellExecutions.length = 20;
      }
      try {
        const parsed = JSON.parse(execResult) as Record<string, unknown>;
        return JSON.stringify({
          ...parsed,
          originalToolCommand: proposedFromTool,
        });
      } catch {
        return execResult;
      }
    }

    // Review FAILED
    if (shouldEarlyStopOnShellReviewFail(review)) {
      return JSON.stringify({
        success: false,
        operation: 'run_shell_command',
        error: 'run_shell_command: command rejected by review (not appropriate for shell).',
        reviewNotesAccumulated: review.notes,
        lastCandidateCommand: proposedFromTool,
        originalToolCommand: proposedFromTool,
        message: 'No command was executed. Follow reviewer guidance (use workspace tools instead).',
      });
    }

    return JSON.stringify({
      success: false,
      operation: 'run_shell_command',
      error: 'run_shell_command: review did not pass.',
      reviewNotesAccumulated: review.notes,
      lastCandidateCommand: proposedFromTool,
      originalToolCommand: proposedFromTool,
      message: 'No command was executed. Adjust the tool arguments from reviewer feedback and retry.',
    });
  }

  /** `compact` is handled in MessageHandler and delegated to ConversationService.compactHistory. */

  public clearTodoList(): void {
    this._todoListManager.clearTodoList();
  }

  /**
   * Lightweight todo state for the main loop to decide whether to keep going.
   * Returns null when no todo list exists.
   */
  public getTodoControlInfo(): { goal: string; list: string; remaining: number; firstPendingIndex: number } | null {
    return this._todoListManager.getControlInfo();
  }

  /** Get the text of a specific todo item by index. */
  public getTodoItemText(index: number): string | null {
    return this._todoListManager.getItemText(index);
  }

  private _cloneTodoState(): TodoState | null {
    return this._todoListManager.cloneState();
  }

  private _todoMarkdown(goal: string, items: { text: string; done: boolean }[]): { list: string; remaining: number } {
    return TodoListManager.formatMarkdown(goal, items);
  }

  private _postTodoDisplay(kind: 'created' | 'expanded', goal: string, _list: string, _remaining: number, items?: { text: string; done: boolean }[]): void {
    // Use the items parameter if available, otherwise fall back to what's in the manager
    const list = items || this._todoListManager.getList()?.items;
    if (list) {
      this._todoListManager.postDisplay(kind, goal, list);
    }
  }

  /** Legacy path when todolist review is disabled in settings. */
  private _createTodoListWithoutReview(
    goal: string,
    items: string[],
    expandIndex: number | undefined
  ): string {
    return this._todoListManager.createWithoutReview(goal, items, expandIndex);
  }

  private async _handleCreateTodoList(args: Record<string, unknown>): Promise<string> {
    const goal = args['goal'] as string;
    const items = (args['items'] as string[]) || [];
    const expandIndex = args['expandIndex'] as number | undefined;
    const cfg = this._context.getTodolistReviewSettings();
    const apiConfig = this._context.getApiConfig();

    if (!cfg.enabled) {
      return this._createTodoListWithoutReview(goal, items, expandIndex);
    }
    if (this._stopped()) {
      return JSON.stringify({ success: false, operation: 'create_todo_list', error: 'Operation stopped by user.' });
    }

    const userRequest = this._context.getLastUserTextForTools();
    const relatedContext = this._context.getRelatedContextForTodolistReview();
    const memoryExcerpt = loadMemoryExcerpt();

    if (this._todoListManager.hasList() && expandIndex !== undefined) {
      if (expandIndex < 0 || expandIndex >= this._todoListManager.getList()!.items.length) {
        return JSON.stringify({
          error: `Expand index ${expandIndex} is out of range (0–${this._todoListManager.getList()!.items.length - 1}).`,
        });
      }
      if (!items.length) {
        return JSON.stringify({ error: 'todolist.edit requires a non-empty items array for expansion.' });
      }

      const baselineFrozen = this._cloneTodoState()!;
      const intentReplacement = items.map((t) => String(t));
      let replacementSlice = [...intentReplacement];
      let reviewNotes: string[] = [];

      for (let attempt = 1; attempt <= cfg.maxAttempts; attempt++) {
        if (this._stopped()) {
          return JSON.stringify({ success: false, operation: 'todolist.edit', error: 'Operation stopped by user.' });
        }
        const baselineForApply: TodoState = baselineFrozen;
        let modified: TodoState;
        try {
          modified = applyExpandToClone(baselineForApply, expandIndex, replacementSlice);
        } catch (e: any) {
          return JSON.stringify({ success: false, operation: 'todolist.edit', error: e.message });
        }

        const changeSummary = `Replace item ${expandIndex} with ${replacementSlice.length} new step(s). Tool goal: ${goal}`;
        this._log('todolistReview', 'request', { operation: 'edit', attempt, expandIndex, changeSummary });
        let review;
        try {
          review = await reviewTodolistEdit({
            apiConfig,
            userRequest,
            operationGoal: goal,
            baseline: baselineFrozen,
            modified,
            expandIndex,
            changeSummary,
            projectConstraints: memoryExcerpt,
            relatedContext,
            reviewNotesAccumulated: reviewNotes,
            reviewTimeoutMs: cfg.reviewTimeoutMs,
            signal: this._signal(),
            log: (e) => this._context.log?.(e),
          });
        } catch (e: any) {
          if (e?.name === 'AbortError' || this._stopped()) {
            return JSON.stringify({ success: false, operation: 'todolist.edit', error: 'Operation stopped by user.' });
          }
          return JSON.stringify({ success: false, operation: 'todolist.edit', error: `Review agent failed: ${e?.message ?? String(e)}` });
        }
        this._log('todolistReview', 'response', { operation: 'edit', attempt, decision: review.decision, summary: review.summary, notes: review.notes });

        if (review.decision === 'PASS') {
          this._todoListManager.setList(
            modified.goal,
            modified.items.map((x) => ({ ...x })),
          );
          const { list, remaining } = this._todoMarkdown(this._todoListManager.getList()!.goal, this._todoListManager.getList()!.items);
          const result = JSON.stringify({
            success: true,
            operation: 'todolist.edit',
            message: `Todo list expanded at index ${expandIndex} with ${replacementSlice.length} items.`,
            goal: this._todoListManager.getList()!.goal,
            items: list,
            remaining,
            reviewAttempts: attempt,
          });
          this._postTodoDisplay('expanded', this._todoListManager.getList()!.goal, list, remaining);
          this._notifyTodoPersisted();
          if (attempt > 1) {
            this._postUiEcho(`✅ **Todo list (expand) review** · passed on round **${attempt}/${cfg.maxAttempts}**.`);
          }
          return result;
        }

        reviewNotes = mergeReviewNotes(reviewNotes, review.notes);
        if (attempt >= cfg.maxAttempts) {
          return JSON.stringify({
            success: false,
            operation: 'todolist.edit',
            error: `todolist.edit: review did not pass after ${cfg.maxAttempts} attempt(s).`,
            reviewNotesAccumulated: reviewNotes,
            message: 'No changes were applied. Adjust create_todo_list (expand) from reviewer feedback and retry.',
          });
        }

        this._postUiEcho(
          `🔁 **Todo list (expand) review** · round **${attempt}/${cfg.maxAttempts}** — not passed\n\n` +
            `${review.summary || 'See reviewer notes in tool result.'}\n\n` +
            `_Regenerating expanded items…_`
        );

        try {
          this._log('todolistWriter', 'request', { operation: 'edit', attempt, expandIndex, proposedNewItems: intentReplacement, reviewNotes });
          const edited = await editorExpandCandidate({
            apiConfig,
            userRequest,
            baseline: baselineFrozen,
            expandIndex,
            proposedNewItems: intentReplacement,
            reviewNotes,
            projectConstraints: memoryExcerpt,
            editorTimeoutMs: cfg.editorTimeoutMs,
            signal: this._signal(),
            log: (e) => this._context.log?.(e),
          });
          replacementSlice = edited.replacementItems;
          this._log('todolistWriter', 'response', { operation: 'edit', attempt, replacementItems: replacementSlice });
        } catch (e: any) {
          this._log('todolistWriter', 'error', { operation: 'edit', attempt, error: e?.message ?? String(e) });
          return JSON.stringify({
            success: false,
            operation: 'todolist.edit',
            error: `Editor agent failed: ${e.message}`,
            reviewNotesAccumulated: reviewNotes,
          });
        }
      }

      return JSON.stringify({ success: false, operation: 'todolist.edit', error: 'Unexpected edit review loop exit.' });
    }

    let reviewNotes: string[] = [];
    let cg = goal;
    let ci = items.map((t) => String(t));
    const operationGoal = goal;

    for (let attempt = 1; attempt <= cfg.maxAttempts; attempt++) {
      if (this._stopped()) {
        return JSON.stringify({ success: false, operation: 'todolist.generate', error: 'Operation stopped by user.' });
      }
      this._log('todolistReview', 'request', { operation: 'generate', attempt, candidateGoal: cg, candidateItems: ci });
      let review;
      try {
        review = await reviewTodolistGenerate({
          apiConfig,
          userRequest,
          operationGoal,
          candidateGoal: cg,
          candidateItems: ci,
          projectConstraints: memoryExcerpt,
          relatedContext,
          reviewTimeoutMs: cfg.reviewTimeoutMs,
          signal: this._signal(),
          log: (e) => this._context.log?.(e),
        });
      } catch (e: any) {
        if (e?.name === 'AbortError' || this._stopped()) {
          return JSON.stringify({ success: false, operation: 'todolist.generate', error: 'Operation stopped by user.' });
        }
        return JSON.stringify({ success: false, operation: 'todolist.generate', error: `Review agent failed: ${e?.message ?? String(e)}` });
      }
      this._log('todolistReview', 'response', { operation: 'generate', attempt, decision: review.decision, summary: review.summary, notes: review.notes });

      if (review.decision === 'PASS') {
        this._todoListManager.setList(cg, ci.map((text) => ({ text, done: false })));
        const { list, remaining } = this._todoMarkdown(cg, this._todoListManager.getList()!.items);
        const result = JSON.stringify({
          success: true,
          operation: 'todolist.generate',
          message: `Todo list created with ${ci.length} items.`,
          goal: cg,
          items: list,
          reviewAttempts: attempt,
        });
        this._postTodoDisplay('created', cg, list, remaining);
        this._notifyTodoPersisted();
        if (attempt > 1) {
          this._postUiEcho(`✅ **Todo list (generate) review** · passed on round **${attempt}/${cfg.maxAttempts}**.`);
        }
        return result;
      }

      reviewNotes = mergeReviewNotes(reviewNotes, review.notes);
      if (attempt >= cfg.maxAttempts) {
        return JSON.stringify({
          success: false,
          operation: 'todolist.generate',
          error: `todolist.generate: review did not pass after ${cfg.maxAttempts} attempt(s).`,
          reviewNotesAccumulated: reviewNotes,
          message: 'No todo list was saved. Revise create_todo_list from reviewer feedback and retry.',
        });
      }

      this._postUiEcho(
        `🔁 **Todo list (generate) review** · round **${attempt}/${cfg.maxAttempts}** — not passed\n\n` +
          `${review.summary || 'See reviewer notes in tool result.'}\n\n` +
          `_Regenerating goal and items…_`
      );

      try {
        this._log('todolistWriter', 'request', { operation: 'generate', attempt, priorGoal: cg, priorItems: ci, reviewNotes });
        const next = await regenerateGenerateCandidate({
          apiConfig,
          userRequest,
          priorGoal: cg,
          priorItems: ci,
          reviewNotes,
          projectConstraints: memoryExcerpt,
          reviewTimeoutMs: cfg.reviewTimeoutMs,
          signal: this._signal(),
          log: (e) => this._context.log?.(e),
        });
        cg = next.goal;
        ci = next.items;
        this._log('todolistWriter', 'response', { operation: 'generate', attempt, goal: cg, items: ci });
      } catch (e: any) {
        this._log('todolistWriter', 'error', { operation: 'generate', attempt, error: e?.message ?? String(e) });
        return JSON.stringify({
          success: false,
          operation: 'todolist.generate',
          error: `Regeneration failed: ${e.message}`,
          reviewNotesAccumulated: reviewNotes,
        });
      }
    }

    return JSON.stringify({ success: false, operation: 'todolist.generate', error: 'Unexpected generate review loop exit.' });
  }
}