import * as vscode from 'vscode';
import * as path from 'path';
import { MessageHandler } from './MessageHandler';
import { ToolExecutor } from './ToolExecutor';
import { SessionManager } from './SessionManager';
import { UIManager } from './UIManager';
import { ConversationService } from './ConversationService';
import type { TodolistReviewSettings } from './todolistReview';
import type { ShellCommandReviewSettings } from './shellCommandReview';
import { gitRollbackTool, listGitSnapshotsTool, setGlobalSkillsDir, activateTerminalTracking } from '../tools';
import { OperationController } from '../operationController';
import { getChatViewHtml } from './chatViewHtml';

export class ChatViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'vibeCodingChat';

  private _messageHandler: MessageHandler;
  private _toolExecutor: ToolExecutor;
  private _sessionManager: SessionManager;
  private _uiManager: UIManager;
  private _conversation: ConversationService;
  private _operation = new OperationController();
  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _context: vscode.ExtensionContext
  ) {
    // ── Initialize global skills pool (shared across all workspaces) ──────
    const globalSkillsDir = path.join(_context.globalStorageUri.fsPath, 'skills');
    setGlobalSkillsDir(globalSkillsDir);

    this._uiManager = new UIManager(_context);

    this._sessionManager = new SessionManager(_context, (msg: any) => this._uiManager.post(msg));

    this._conversation = new ConversationService(
      this._sessionManager,
      () => this._uiManager.getApiConfig(),
      (msg) => this._uiManager.post(msg)
    );

    this._toolExecutor = new ToolExecutor({
      post: (msg) => this._uiManager.post(msg),
      persistAssistantUiEcho: (content: string) => {
        this._conversation.addMessage({ role: 'assistant', content, hiddenFromLlm: true });
        this._uiManager.post({ type: 'addMessage', message: { role: 'assistant', content } });
      },
      persistAssistantTodoState: (state) => {
        this._sessionManager.setCurrentSessionAssistantTodoState(
          state === null
            ? null
            : { goal: state.goal, items: state.items.map((i) => ({ text: i.text, done: i.done })) }
        );
      },
      llmCheckReplace: async (ctx) => {
        // Independent code-edit review focusing only on the edit's code-level consistency.
        const { llmIndependentEditReview } = await import('./codeEditReview.js');
        const apiConfig = this._uiManager.getApiConfig();
        const reviewRound = this._toolExecutor.nextEditReviewRound();
        return llmIndependentEditReview({
          ctx,
          apiConfig,
          post: (m: any) => this._uiManager.post(m),
          reviewRound,
          signal: this._operation.signal(),
          log: (e) => this._conversation.addAgentLog(e),
        });
      },
      userConfirmReplace: (ctx) => this._uiManager.userConfirmReplace(ctx),
      userConfirmShellCommand: (command) => this._uiManager.userConfirmShellCommand(command),
      userConfirmHumanAssistance: (question) => this._uiManager.userConfirmHumanAssistance(question),
      getApiConfig: () => this._uiManager.getApiConfig(),
      getLastUserTextForTools: () => this._conversation.getLastUserTextForTools(),
      getRelatedContextForTodolistReview: () => this._conversation.getRelatedContextForTodolistReview(),
      getTodolistReviewSettings: () => ChatViewProvider._readTodolistReviewSettings(),
      getShellCommandReviewSettings: () => ChatViewProvider._readShellCommandReviewSettings(),
      getEditPermissionEnabled: () => this._uiManager.getEditPermissionEnabled(),
      setEditPermissionEnabled: (enabled: boolean) => this._uiManager.setEditPermissionEnabled(enabled),
      isStopped: () => this._operation.isStopped(),
      signal: () => this._operation.signal(),
      log: (e) => this._conversation.addAgentLog(e),
    });

    // ── Wire up activated skills persistence ──────────────────────────────
    // ToolExecutor <-> SessionManager: activate/deactivate skills propagate
    this._toolExecutor.registerActivatedSkillsPersister(
      () => this._sessionManager.getCurrentSessionActivatedSkills(),
      (skills) => { this._sessionManager.setCurrentSessionActivatedSkills(skills); }
    );

    // Restore activated skills from persisted session
    const persistedSkills = this._sessionManager.getCurrentSessionActivatedSkills();
    if (persistedSkills.length > 0) {
      this._toolExecutor.restoreActivatedSkills(persistedSkills);
    }

    // Wire up ConversationService so buildMessagesForLlm can read activated skills
    this._conversation.setActivatedSkillsGetter(
      () => this._toolExecutor.getActivatedSkills()
    );

    // ── Restore todo state ────────────────────────────────────────────────
    this._toolExecutor.restorePersistedTodoState(this._sessionManager.getCurrentSessionAssistantTodoState());

    this._messageHandler = new MessageHandler({
      getApiConfig: () => this._uiManager.getApiConfig(),
      post: (msg) => this._uiManager.post(msg),
      buildMessagesForLlm: (systemPrompt) => this._conversation.buildMessagesForLlm(systemPrompt),
      addMessage: (msg) => this._conversation.addMessage(msg),
      addMessageToSession: (sessionId, msg) => this._conversation.addMessageToSession(sessionId, msg),

      getCurrentSessionId: () => this._conversation.getCurrentSessionId(),
      saveCurrentSession: () => this._conversation.saveCurrentSession(),
      sanitizeIncompleteToolCalls: () => this._conversation.sanitizeIncompleteToolCalls(),
      executeTool: (name, args) => this._toolExecutor.executeTool(name, args),
      getTodoControlInfo: () => this._toolExecutor.getTodoControlInfo(),
      getSessionEditedFiles: () => this._toolExecutor.getSessionEditedFiles(),
      getEditPermissionEnabled: () => this._uiManager.getEditPermissionEnabled(),
      compactHistory: (triggeredByTokenLimit) => this._conversation.compactHistory(triggeredByTokenLimit),
      addUsageSnapshot: (promptTokens) => this._conversation.addUsageSnapshot(promptTokens),
      onUserInstructionStart: () => this._toolExecutor.resetReviewUiCounters(),
      operation: this._operation,
      onStopSideEffects: () => this._uiManager.cancelPendingConfirms(),
      autoNameSession: () => { void this._conversation.autoNameSession(); },
      setBlockedTools: (tools: string[]) => this._toolExecutor.setBlockedTools(tools),
      compactAgentMessages: (tag: string) => this._conversation.compactAgentMessages(tag),
    });

    // ── Activate terminal output tracking ────────────────────────────────
    activateTerminalTracking(this._context);
  }
  public setOutputChannel(channel: vscode.OutputChannel): void {
    this._uiManager.setOutputChannel(channel);
  }

  private static _readTodolistReviewSettings(): TodolistReviewSettings {
    const c = vscode.workspace.getConfiguration('vibe-coding');
    return {
      enabled: c.get<boolean>('todolistReview.enabled', true) !== false,
      maxAttempts: Math.max(1, c.get<number>('todolistReview.maxAttempts', 5)),
      reviewTimeoutMs: Math.max(5000, c.get<number>('todolistReview.reviewTimeoutMs', 120000)),
      editorTimeoutMs: Math.max(5000, c.get<number>('todolistReview.editorTimeoutMs', 120000)),
    };
  }

  private static _readShellCommandReviewSettings(): ShellCommandReviewSettings {
    const c = vscode.workspace.getConfiguration('vibe-coding');
    return {
      enabled: c.get<boolean>('shellCommandReview.enabled', true) !== false,
      reviewTimeoutMs: Math.max(5000, c.get<number>('shellCommandReview.reviewTimeoutMs', 120000)),
    };
  }

  // ─── WebviewViewProvider ───────────────────────────────────────────────────
  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this._uiManager.setView(webviewView);

    webviewView.webview.options = {
      enableScripts: true,
      enableCommandUris: true,  // 允许命令URI，用于调用VSCode命令
      localResourceRoots: [
        this._extensionUri,
        // 允许访问工作区根目录
        ...(vscode.workspace.workspaceFolders?.map(f => f.uri) || []),
        // 允许访问用户主目录（用于临时文件）
        vscode.Uri.file(require('os').homedir())
      ],
    };
    webviewView.webview.html = getChatViewHtml(webviewView.webview, this._extensionUri);

    webviewView.webview.onDidReceiveMessage(async (msg) => {
      if (msg.type === 'sendMessage') {
        await this._messageHandler.handleUserMessage(msg.text);
      }
      if (msg.type === 'ready') {
        this._uiManager.sendWorkspaceBanner();
        this._sessionManager.postSessionsList();
        // Restore model selection from persisted session
        this._restoreModelFromSession();
        this._sendModelListToWebview();
        this._replayWebview();
      }
      if (msg.type === 'webviewError') {
        const message =
          typeof msg.message === 'string' && msg.message.trim()
            ? msg.message.trim()
            : 'Unknown webview error';
        this._uiManager.post({ type: 'error', message: `Webview error: ${message}` });
      }
      if (msg.type === 'stopOperation') {
        this._messageHandler.stopCurrentOperation();
      }
      if (msg.type === 'clearHistory') {
        this.clearHistory();
        this._uiManager.post({ type: 'clearMessages' });
      }
      if (msg.type === 'newSession') {
        await this._createNewSession();
      }
      if (msg.type === 'switchSession') {
        await this._sessionManager.switchSession(msg.sessionId);
        this._toolExecutor.restorePersistedTodoState(this._sessionManager.getCurrentSessionAssistantTodoState());
        // Restore activated skills for the switched-to conversation
        const switchedSkills = this._sessionManager.getCurrentSessionActivatedSkills();
        this._toolExecutor.restoreActivatedSkills(switchedSkills);
        // Restore model selection for the switched-to conversation
        this._restoreModelFromSession();
        this._sendModelListToWebview();
        this._uiManager.post({ type: 'clearMessages' });
        this._replayWebview();
      }
      if (msg.type === 'deleteSession') {
        const wasCurrent = this._sessionManager.getCurrentSessionId() === msg.sessionId;
        const deleted = await this._sessionManager.deleteSession(msg.sessionId);
        if (deleted && wasCurrent) {
          this._toolExecutor.restorePersistedTodoState(this._sessionManager.getCurrentSessionAssistantTodoState());
          this._uiManager.post({ type: 'clearMessages' });
          this._replayWebview();
        }
      }
      if (msg.type === 'duplicateSession') {
        const newSession = await this._sessionManager.duplicateSession(msg.sessionId);
        if (newSession) {
          this._toolExecutor.restorePersistedTodoState(null);
          this._uiManager.post({ type: 'clearMessages' });
          this._replayWebview();
        }
      }
      if (msg.type === 'updateSessionTitle') {

        await this._updateSessionTitle(msg.sessionId, msg.title);
      }
      if (msg.type === 'renameSession') {
        const newTitle = await vscode.window.showInputBox({
          title: 'Rename conversation',
          value: msg.currentTitle ?? '',
          validateInput: (v) => (v?.trim() ? undefined : 'Title cannot be empty'),
        });
        if (newTitle?.trim()) {
          this._sessionManager.updateSessionTitle(msg.sessionId, newTitle.trim());
          this._sessionManager.postSessionsList();
        }
      }
      if (msg.type === 'showSnapshots') {
        await this._showGitSnapshots();
      }
      if (msg.type === 'rollbackToSnapshot') {
        await this._rollbackToSnapshot(msg.snapshot);
      }
      if (msg.type === 'replaceConfirmResponse') {
        this._uiManager.resolveReplaceConfirm(
          typeof msg.requestId === 'string' ? msg.requestId : '',
          !!msg.approved
        );
      }
      if (msg.type === 'shellConfirmResponse') {
        this._uiManager.resolveShellConfirm(
          typeof msg.requestId === 'string' ? msg.requestId : '',
          !!msg.approved
        );
      }
      if (msg.type === 'humanAssistanceConfirmResponse') {
        this._uiManager.resolveHumanAssistanceConfirm(
          typeof msg.requestId === 'string' ? msg.requestId : '',
          !!msg.approved,
          typeof msg.userMessage === 'string' ? msg.userMessage : undefined
        );
      }
       if (msg.type === 'setEditPermission') {
          this._uiManager.setEditPermissionEnabled(!!msg.enabled);
        }
        if (msg.type === 'switchModel') {
          const index = typeof msg.index === 'number' ? msg.index : -1;
          this._uiManager.setSelectedModelIndex(index);
          // Persist model selection to the current conversation
          this._sessionManager.setCurrentSessionSelectedModelIndex(index);
          this._sendModelListToWebview();
        }
      });
    }

  private _sendModelListToWebview(): void {
    const models = this._uiManager.getModels();
    const selectedIndex = this._uiManager.getSelectedModelIndex();
    const currentDisplayName = this._uiManager.getSelectedModelDisplayName();
    this._uiManager.post({
      type: 'modelList',
      models: models.map((m) => ({ name: m.name, model: m.model })),
      selectedIndex,
      currentDisplayName,
    });
  }

  /**
   * Restore the model selection index from the current session into UIManager.
   * Called on session switch, initial load, and after session creation.
   */
  private _restoreModelFromSession(): void {
    const sessionIndex = this._sessionManager.getCurrentSessionSelectedModelIndex();
    this._uiManager.setSelectedModelIndex(sessionIndex);
  }

  private _replayWebview(): void {
    this._conversation.replaySessionToWebview((m) => this._uiManager.post(m));
  }

  private async _createNewSession(): Promise<void> {
    await this._sessionManager.createSession();
    this._toolExecutor.restorePersistedTodoState(this._sessionManager.getCurrentSessionAssistantTodoState());
    this._uiManager.post({ type: 'clearMessages' });
    this._replayWebview();
  }

  private async _updateSessionTitle(sessionId: string, title: string): Promise<void> {
    this._sessionManager.updateSessionTitle(sessionId, title);
    this._sessionManager.postSessionsList();
  }

  private async _showGitSnapshots(): Promise<void> {
    try {
      const result = listGitSnapshotsTool(this._sessionManager.getCurrentSessionId());
      const parsed = JSON.parse(result);

      if (parsed.error) {
        this._uiManager.post({ type: 'info', message: `Failed to list snapshots: ${parsed.error}` });
        return;
      }

      this._uiManager.post({
        type: 'snapshotsList',
        snapshots: parsed.snapshots ?? [],
      });
    } catch (error: any) {
      this._uiManager.post({ type: 'info', message: `Error showing snapshots: ${error.message}` });
    }
  }

  private async _rollbackToSnapshot(snapshot: {
    tag: string;
    snapshotId: string;
    userInstruction: string;
  }): Promise<void> {
    const confirmation = await vscode.window.showWarningMessage(
      `Roll back to before: "${snapshot.userInstruction}"?

Uncommitted changes will be lost.`,
      { modal: true },
      'Roll back',
      'Cancel'
    );

    if (confirmation !== 'Roll back') {
      return;
    }

    try {
      const result = gitRollbackTool({
        snapshotId: snapshot.snapshotId,
        sessionId: this._sessionManager.getCurrentSessionId(),
      });

      const parsed = JSON.parse(result);

      if (!parsed.success) {
        this._uiManager.post({ type: 'error', message: `Rollback failed: ${parsed.error}` });
        return;
      }

      const instruction = snapshot.userInstruction;
      this._conversation.truncateBeforeUserMessage(instruction);

      this._uiManager.post({ type: 'clearMessages' });
      this._replayWebview();

      this._uiManager.post({
        type: 'info',
        message: `✅ Rolled back to before: "${instruction.substring(0, 60)}${instruction.length > 60 ? '…' : ''}"`,
      });
    } catch (error: any) {
      this._uiManager.post({ type: 'error', message: `Rollback error: ${error.message}` });
    }
  }

  public clearHistory(): void {
    this._toolExecutor.clearTodoList();
    this._sessionManager.clearHistory();
  }
}
