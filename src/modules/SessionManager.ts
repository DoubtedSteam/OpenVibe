import * as vscode from 'vscode';
import { ChatMessage, ChatSession, AgentLogEntry, AssistantTodoPersistedState, CompressedArchive } from '../types';
import * as fs from 'fs';
import * as path from 'path';

export class SessionManager {
  /** Persisted per workspace so reload restores the open conversation. */
  private static readonly _WORKSPACE_ACTIVE_SESSION_KEY = 'openvibe.currentSessionId';

  private _currentSessionId: string = 'default';
  private _sessions: ChatSession[] = [];
  private _currentWorkspacePath: string | null = null;
  private _saveTimer: NodeJS.Timeout | null = null;
  private _saveInFlight = false;
  private _saveQueued = false;

  constructor(
    private readonly _context: vscode.ExtensionContext,
    private readonly _post: (msg: any) => void
  ) {
    this._loadSessions();
    this._setupWorkspaceChangeListeners();
  }
  private _ensureSessionsDir(): string | null {
    const workspaceRoot = this._getWorkspaceRoot();
    if (!workspaceRoot) {
      // No workspace → do not fall back to global storage.
      // Requirement: sidebar should only reflect the current workspace folder's `.OpenVibe`.
      return null;
    }

    const sessionsDir = path.join(workspaceRoot, '.OpenVibe', 'sessions');
    // Migration: some versions stored sessions under `.openvibe/sessions`.
    // If the target location doesn't exist but legacy index does, copy it once.
    try {
      const legacyDir = path.join(workspaceRoot, '.openvibe', 'sessions');
      const legacyIndex = path.join(legacyDir, 'index.json');
      const newIndex = path.join(sessionsDir, 'index.json');
      if (!fs.existsSync(sessionsDir) && fs.existsSync(legacyIndex)) {
        fs.mkdirSync(sessionsDir, { recursive: true });
        if (!fs.existsSync(newIndex)) {
          fs.copyFileSync(legacyIndex, newIndex);
        }
      }
    } catch {
      // non-fatal
    }
    if (!fs.existsSync(sessionsDir)) {
      fs.mkdirSync(sessionsDir, { recursive: true });
    }
    return sessionsDir;
  }
  private _getWorkspaceRoot(): string | null {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      return null;
    }
    return workspaceFolders[0].uri.fsPath;
  }

  private _setupWorkspaceChangeListeners(): void {
    // 监听工作区文件夹变化
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      const newRoot = this._getWorkspaceRoot();
      const changed = newRoot !== this._currentWorkspacePath;

      // 工作区发生变化时重新加载会话（来自新工作区的 .OpenVibe/sessions）
      if (changed) {
        // Ensure we don't carry a previous workspace's active session selection.
        this._currentSessionId = 'default';
      }
      this._loadSessions();
      this.postSessionsList();

      // Clear chat UI when switching to a different workspace folder.
      // The new workspace should not display the previous workspace's conversation.
      if (changed) {
        this._post({ type: 'clearMessages' });
        if (newRoot) {
          this._post({
            type: 'addMessage',
            message: { role: 'system', content: `Workspace changed: ${newRoot}` },
          });
        } else {
          this._post({
            type: 'addMessage',
            message: { role: 'system', content: `Workspace changed: (no workspace open)` },
          });
        }
      }
    });
  }

  private _createDefaultSession(): void {
    const now = Date.now();
    const defaultSession: ChatSession = {
      id: 'default',
      title: 'New Conversation',
      created: now,
      updated: now,
      messages: [],
      lastOpenedAt: now
    };
    this._sessions = [defaultSession];
    this._currentSessionId = 'default';
    this._saveSessions();
    void this._persistActiveSessionId();
  }

  public getCurrentMessages(): ChatMessage[] {
    const currentSession = this._sessions.find(s => s.id === this._currentSessionId);
    return currentSession?.messages || [];
  }

  public getCurrentSessionId(): string {
    return this._currentSessionId;
  }

  public addMessage(msg: ChatMessage): void {
    const messages = this.getCurrentMessages();
    messages.push(msg);
    this.setCurrentMessages(messages);
  }

  public addAgentLog(entry: AgentLogEntry): void {
    let session = this._sessions.find(s => s.id === this._currentSessionId);
    if (!session) {
      session = {
        id: this._currentSessionId,
        title: 'Chat Session',
        created: Date.now(),
        updated: Date.now(),
        messages: [],
        agentLogs: [],
        lastOpenedAt: Date.now()
      };
      this._sessions.push(session);
    }
    if (!Array.isArray(session.agentLogs)) {
      session.agentLogs = [];
    }
    session.agentLogs.push(entry);
    // Keep logs bounded to avoid huge index.json growth.
    if (session.agentLogs.length > 500) {
      session.agentLogs = session.agentLogs.slice(session.agentLogs.length - 500);
    }
    session.updated = Date.now();
    this._saveSessions();
  }

  public saveCurrentSession(): void {
    this._saveSessions();
  }

  public setCurrentMessages(messages: ChatMessage[]): void {
    let session = this._sessions.find(s => s.id === this._currentSessionId);
    if (!session) {
      session = {
        id: this._currentSessionId,
        title: 'Chat Session',
        created: Date.now(),
        updated: Date.now(),
        messages: [],
        lastOpenedAt: Date.now()
      };
      this._sessions.push(session);
    }
    session.messages = messages;
    session.updated = Date.now();
    this._saveSessions();
  }

  private _loadSessions(): void {
    try {
      const sessionsDir = this._ensureSessionsDir();
      const indexFile = sessionsDir ? path.join(sessionsDir, 'index.json') : null;
      
      // 重置会话列表并更新当前工作区路径
      this._sessions = [];
      this._currentWorkspacePath = this._getWorkspaceRoot();
      
      if (indexFile && fs.existsSync(indexFile)) {
        const indexContent = fs.readFileSync(indexFile, 'utf-8');
        this._sessions = JSON.parse(indexContent);
      }
      
      // 确保至少有一个默认会话
      if (this._sessions.length === 0) {
        this._createDefaultSession();
      } else {
        this._applyPersistedActiveSession();
      }
    } catch (err) {
      this._post({ type: 'error', message: `Failed to load sessions: ${err}` });
    }
  }

  /** After loading `index.json`, restore last active session or fix invalid id. */
  private _applyPersistedActiveSession(): void {
    const saved = this._context.workspaceState.get<string>(SessionManager._WORKSPACE_ACTIVE_SESSION_KEY);
    if (saved && this._sessions.some((s) => s.id === saved)) {
      this._currentSessionId = saved;
      return;
    }
    // Fallback: find session with the latest lastOpenedAt timestamp
    const sortedByLastOpened = [...this._sessions].sort((a, b) => (b.lastOpenedAt ?? 0) - (a.lastOpenedAt ?? 0));
    const lastOpened = sortedByLastOpened[0];
    if (lastOpened) {
      this._currentSessionId = lastOpened.id;
    } else if (!this._sessions.some((s) => s.id === this._currentSessionId)) {
      this._currentSessionId = this._sessions[0]!.id;
    }
    void this._persistActiveSessionId();
  }

  private _persistActiveSessionId(): Thenable<void> {
    return this._context.workspaceState.update(SessionManager._WORKSPACE_ACTIVE_SESSION_KEY, this._currentSessionId);
  }

  private _saveSessions(): void {
    // IMPORTANT: This runs on the extension host thread. Avoid sync I/O and avoid
    // saving on every tiny event (agent logs can be frequent). Debounce writes.
    this._saveQueued = true;
    if (this._saveTimer) {
      return;
    }
    this._saveTimer = setTimeout(() => {
      this._saveTimer = null;
      void this._flushSaveSessions();
    }, 250);
  }

  private async _flushSaveSessions(): Promise<void> {
    if (this._saveInFlight) {
      return;
    }
    if (!this._saveQueued) {
      return;
    }
    this._saveInFlight = true;
    this._saveQueued = false;
    try {
      const sessionsDir = this._ensureSessionsDir();
      if (!sessionsDir) {
        return;
      }
      const indexFile = path.join(sessionsDir, 'index.json');
      const text = JSON.stringify(this._sessions, null, 2);
      await fs.promises.writeFile(indexFile, text, 'utf-8');
    } catch (err) {
      this._post({ type: 'error', message: `Failed to save sessions: ${err}` });
    } finally {
      this._saveInFlight = false;
      // If new saves were queued while we were writing, flush again quickly.
      if (this._saveQueued) {
        this._saveTimer = setTimeout(() => {
          this._saveTimer = null;
          void this._flushSaveSessions();
        }, 50);
      }
    }
  }

  public postSessionsList(): void {
    this._post({
      type: 'sessionsList',
      sessions: this._sessions.map(s => ({
        id: s.id,
        title: s.title,
        created: s.created,
        updated: s.updated,
        messageCount: s.messages ? s.messages.filter(m => m.role === 'user').length : 0,
        isActive: s.id === this._currentSessionId
      }))
    });
  }

  public async switchSession(sessionId: string): Promise<void> {
    const newSession = this._sessions.find(s => s.id === sessionId);
    if (!newSession) {
      console.warn(`Session ${sessionId} not found`);
      return;
    }

    this.saveCurrentSession();
    this._currentSessionId = sessionId;
    newSession.lastOpenedAt = Date.now();
    void this._persistActiveSessionId();
    this.postSessionsList();
  }

  public updateSessionTitle(sessionId: string, title: string): void {
    const session = this._sessions.find(s => s.id === sessionId);
    if (!session) {
      return;
    }
    session.title = title;
    session.updated = Date.now();
    this._saveSessions();
    this.postSessionsList();
  }

  public async deleteSession(sessionId: string): Promise<boolean> {
    const sessionIndex = this._sessions.findIndex(s => s.id === sessionId);
    if (sessionIndex === -1) {
      console.warn(`Session ${sessionId} not found`);
      return false;
    }

    // 如果要删除的是当前会话，先尝试切换到另一个会话
    if (sessionId === this._currentSessionId) {
      const otherSession = this._sessions.find(s => s.id !== sessionId);
      if (otherSession) {
        await this.switchSession(otherSession.id);
      }
    }

    // 从数组中移除
    this._sessions.splice(sessionIndex, 1);

    // 删除后如果列表为空，自动创建一个新的默认会话
    if (this._sessions.length === 0) {
      this._createDefaultSession();
    }

    this._saveSessions();
    this.postSessionsList();
    return true;
  }

  public async createSession(): Promise<ChatSession> {
    const now = Date.now();
    const sessionId = `session_${now}_${Math.random().toString(36).substr(2, 9)}`;
    const newSession: ChatSession = {
      id: sessionId,
      title: `Conversation ${this._sessions.length + 1}`,
      created: now,
      updated: now,
      messages: [],
      isActive: true,
      lastOpenedAt: now
    };
    
    // Add to sessions list
    this._sessions.push(newSession);
    
    // Save sessions
    this._saveSessions();
    
    // Switch to new session
    await this.switchSession(sessionId);
    
    return newSession;
  }

  public clearHistory(): void {
    // Clear messages in current session
    const currentSession = this._sessions.find(s => s.id === this._currentSessionId);
    if (currentSession) {
      currentSession.messages = [];
      delete currentSession.assistantTodoState;
      currentSession.updated = Date.now();
      this._saveSessions();
    }
  }

  public getCurrentSessionAssistantTodoState(): AssistantTodoPersistedState | null {
    const currentSession = this._sessions.find((s) => s.id === this._currentSessionId);
    const st = currentSession?.assistantTodoState;
    if (!st || typeof st.goal !== 'string' || !Array.isArray(st.items)) {
      return null;
    }
    return st;
  }

  public setCurrentSessionAssistantTodoState(state: AssistantTodoPersistedState | null): void {
    const currentSession = this._sessions.find((s) => s.id === this._currentSessionId);
    if (!currentSession) {
      return;
    }
    if (state == null) {
      delete currentSession.assistantTodoState;
    } else {
      currentSession.assistantTodoState = {
        goal: state.goal,
        items: state.items.map((i) => ({ text: String(i.text), done: !!i.done })),
      };
    }
    currentSession.updated = Date.now();
    this._saveSessions();
  }

  /**
   * Archive a batch of pre-compact messages to the current session.
   * Keeps at most 10 archives to prevent unbounded growth.
   * Newest archive is inserted at index 0.
   */
  public addCompressedArchive(archive: CompressedArchive): void {
    const currentSession = this._sessions.find((s) => s.id === this._currentSessionId);
    if (!currentSession) return;

    if (!Array.isArray(currentSession.compressedArchives)) {
      currentSession.compressedArchives = [];
    }

    currentSession.compressedArchives.unshift(archive);

    // Keep at most 10 archives to bound storage growth
    if (currentSession.compressedArchives.length > 10) {
      currentSession.compressedArchives = currentSession.compressedArchives.slice(0, 10);
    }

    currentSession.updated = Date.now();
    this._saveSessions();
  }

  // ─── Activated skills (conversation-scoped) ───────────────────────────────

  /**
   * Get activated skill names for the current conversation.
   */
  public getCurrentSessionActivatedSkills(): string[] {
    const currentSession = this._sessions.find((s) => s.id === this._currentSessionId);
    if (!currentSession?.activatedSkills || !Array.isArray(currentSession.activatedSkills)) {
      return [];
    }
    return currentSession.activatedSkills.filter((s): s is string => typeof s === 'string');
  }

  /**
   * Set activated skill names for the current conversation and persist.
   */
  public setCurrentSessionActivatedSkills(skills: string[]): void {
    const currentSession = this._sessions.find((s) => s.id === this._currentSessionId);
    if (!currentSession) {
      return;
    }
    currentSession.activatedSkills = [...skills];
    currentSession.updated = Date.now();
    this._saveSessions();
  }
}