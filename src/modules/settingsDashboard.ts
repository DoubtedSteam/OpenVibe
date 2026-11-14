// ─── modules/settingsDashboard.ts ───────────────────────────────────────────
// Visual settings dashboard ("后台设置中心") for OpenVibe.
//
// A standalone WebviewPanel reachable from the chat webview toolbar (and the
// command palette) that lets the user edit ALL vibe-coding.* settings and
// visually manage tool profiles (modes): for each mode it renders the full
// plugin (tool) matrix so the user can see — and toggle — which tools are
// visible/hidden in that mode.
//
// Settings are written through vscode.workspace.getConfiguration(...).update
// with a strict key whitelist. Profile files live in ~/.openvibe/tool-profiles
// and are manipulated through the toolProfiles module.

import * as vscode from 'vscode';
import { TOOL_DEFINITIONS } from '../toolDefinitions';
import { getSettingsDashboardHtml } from './settingsDashboardHtml';
import { ConfigService, CONFIG_DEFAULTS } from './ConfigService';
import {
  listToolProfilesDetailed,
  saveToolProfile,
  deleteToolProfile,
  getProfilesDir,
  applyToolProfile,
  getCurrentToolProfile,
  DEFAULT_TOOL_PROFILE,
  SAMPLE_40K_SYSTEM_PROMPT,
} from '../tools';
import { PROVIDER_PRESETS, THINKING_DIALECTS, THINKING_DIALECT_LABELS } from '../providers';




export const SETTINGS_VIEW_TYPE = 'openvibeSettings';

// ── Settings schema (whitelist) ──────────────────────────────────────────────
type SettingKind = 'string' | 'boolean' | 'number' | 'json';

const SETTING_SPECS: Record<string, SettingKind> = {
  apiBaseUrl: 'string',
  apiKey: 'string',
  model: 'string',
  apiProvider: 'string',
  thinkingMode: 'string',
  models: 'json',
  toolProfile: 'string',
  confirmChanges: 'boolean',
  confirmShellCommand: 'boolean',
  maxInteractions: 'number',
  maxSequenceLength: 'number',
  contextWindow: 'number',
  maxOutputTokens: 'number',
  thinkingBudget: 'number',
  language: 'string',
  reasoningEffort: 'string',
  'todolistReview.enabled': 'boolean',
  'todolistReview.maxAttempts': 'number',
  'todolistReview.reviewTimeoutMs': 'number',
  'todolistReview.editorTimeoutMs': 'number',
  'memorySync.enabled': 'boolean',
  'editReview.enabled': 'boolean',
  'editReview.timeoutMs': 'number',
  'shellCommandReview.enabled': 'boolean',
  'shellCommandReview.reviewTimeoutMs': 'number',
};

/**
 * Defaults shown in the dashboard when a key is not present in user settings.
 * Derived from ConfigService.CONFIG_DEFAULTS (single source of truth, same as package.json).
 */
const SETTING_DEFAULTS: Record<string, unknown> = {
  apiBaseUrl: CONFIG_DEFAULTS.apiBaseUrl,
  apiKey: CONFIG_DEFAULTS.apiKey,
  model: CONFIG_DEFAULTS.model,
  apiProvider: CONFIG_DEFAULTS.apiProvider,
  thinkingMode: CONFIG_DEFAULTS.thinkingMode,
  models: CONFIG_DEFAULTS.models,
  toolProfile: CONFIG_DEFAULTS.toolProfile,
  confirmChanges: CONFIG_DEFAULTS.confirmChanges,
  confirmShellCommand: CONFIG_DEFAULTS.confirmShellCommand,
  maxInteractions: CONFIG_DEFAULTS.maxInteractions,
  maxSequenceLength: CONFIG_DEFAULTS.maxSequenceLength,
  contextWindow: CONFIG_DEFAULTS.contextWindow,
  maxOutputTokens: CONFIG_DEFAULTS.maxOutputTokens,
  thinkingBudget: CONFIG_DEFAULTS.thinkingBudget,
  language: CONFIG_DEFAULTS.language,
  reasoningEffort: CONFIG_DEFAULTS.reasoningEffort,
  'todolistReview.enabled': CONFIG_DEFAULTS.todolistReviewEnabled,
  'todolistReview.maxAttempts': CONFIG_DEFAULTS.todolistReviewMaxAttempts,
  'todolistReview.reviewTimeoutMs': CONFIG_DEFAULTS.todolistReviewReviewTimeoutMs,
  'todolistReview.editorTimeoutMs': CONFIG_DEFAULTS.todolistReviewEditorTimeoutMs,
  'memorySync.enabled': CONFIG_DEFAULTS.memorySyncEnabled,
  'editReview.enabled': CONFIG_DEFAULTS.editReviewEnabled,
  'editReview.timeoutMs': CONFIG_DEFAULTS.editReviewTimeoutMs,
  'shellCommandReview.enabled': CONFIG_DEFAULTS.shellCommandReviewEnabled,
  'shellCommandReview.reviewTimeoutMs': CONFIG_DEFAULTS.shellCommandReviewTimeoutMs,
};


let currentPanel: vscode.WebviewPanel | undefined;

/** ConfigService instance injected by extension.ts (single shared instance). */
let activeConfig: ConfigService | undefined;


function post(panel: vscode.WebviewPanel, message: unknown): void {
  void panel.webview.postMessage(message);
}

/**
 * Read the GLOBAL value of every whitelisted setting (falling back to the
 * built-in default when the key is unset). The dashboard edits global config
 * only, so workspace/folder-level overrides must NOT leak into the form.
 */
function readSettingsSnapshot(): Record<string, unknown> {
  const cfg = activeConfig!.getConfiguration();

  const out: Record<string, unknown> = {};
  for (const key of Object.keys(SETTING_SPECS)) {
    // apiKey lives in SecretStorage; surface the cached value instead of the (legacy) settings field.
    if (key === 'apiKey') {
      out[key] = activeConfig!.getApiKey();
      continue;
    }
    const info = cfg.inspect(key);
    const globalValue = info && info.globalValue !== undefined ? info.globalValue : undefined;
    out[key] = globalValue !== undefined ? globalValue : SETTING_DEFAULTS[key];
  }
  return out;

}

/**
 * Detect workspace/folder-level overrides that shadow the global value.
 * Returns a map of key → { workspaceValue?, workspaceFolderValue? } so the UI
 * can warn the user why the global value may not take effect in this window.
 */
function readOverrides(): Record<string, { workspaceValue?: unknown; workspaceFolderValue?: unknown }> {
  const cfg = activeConfig!.getConfiguration();

  const out: Record<string, { workspaceValue?: unknown; workspaceFolderValue?: unknown }> = {};
  for (const key of Object.keys(SETTING_SPECS)) {
    const info = cfg.inspect(key);
    if (!info) continue;
    const entry: { workspaceValue?: unknown; workspaceFolderValue?: unknown } = {};
    if (info.workspaceValue !== undefined) entry.workspaceValue = info.workspaceValue;
    if (info.workspaceFolderValue !== undefined) entry.workspaceFolderValue = info.workspaceFolderValue;
    if (entry.workspaceValue !== undefined || entry.workspaceFolderValue !== undefined) {
      out[key] = entry;
    }
  }
  return out;
}

/** Build the full dashboard state sent to the webview. */
function buildState(): Record<string, unknown> {
  return {
    type: 'state',
    settings: readSettingsSnapshot(),
    overrides: readOverrides(),
    profiles: listToolProfilesDetailed(),
    tools: TOOL_DEFINITIONS.map((d) => ({
      name: d.function.name,
      description: d.function.description,
    })),
    profilesDir: getProfilesDir(),
    currentProfile: getCurrentToolProfile(),
    sampleSystemPrompt: SAMPLE_40K_SYSTEM_PROMPT,
    /**
     * Provider preset catalog + dialect ids, so the webview can render the
     * vendor dropdowns (and prefill Base URLs) without duplicating the list.
     */
    providers: PROVIDER_PRESETS.map((p) => ({
      id: p.id,
      label: p.label,
      baseUrl: p.baseUrl,
      thinking: p.thinking,
      note: p.note ?? '',
      supportsEffortLevels: p.supportsEffortLevels,
    })),
    thinkingDialects: THINKING_DIALECTS.map((id) => ({ id, label: THINKING_DIALECT_LABELS[id] })),
    version: '1.0',
  };
}

/** Refresh the chat view's mode selector after mode/profile mutations. */
function refreshChatView(): void {
  void vscode.commands.executeCommand('vibe-coding.refreshModes');
}

/**
 * Open (or focus) the settings dashboard panel.
 */
export function openSettingsDashboard(context: vscode.ExtensionContext, config: ConfigService): void {
  activeConfig = config;
  if (currentPanel) {
    currentPanel.reveal(undefined, true);
    return;
  }


  const panel = vscode.window.createWebviewPanel(
    SETTINGS_VIEW_TYPE,
    'OpenVibe 设置中心',
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [context.extensionUri],
    }
  );
  currentPanel = panel;

  panel.webview.html = getSettingsDashboardHtml(panel.webview, context.extensionUri);

  panel.onDidDispose(() => {
    currentPanel = undefined;
  });

  panel.webview.onDidReceiveMessage(async (msg: any) => {
    switch (msg?.type) {
      case 'getState': {
        post(panel, buildState());
        break;
      }

      case 'updateSetting': {
        const key = typeof msg.key === 'string' ? msg.key : '';
        const spec = SETTING_SPECS[key];
        if (!spec) {
          post(panel, { type: 'settingUpdateResult', key, ok: false, error: `Unknown setting key: ${key}` });
          break;
        }
        let value: unknown = msg.value;
        if (spec === 'boolean') {
          value = !!value;
        } else if (spec === 'number') {
          const n = Number(value);
          if (!Number.isFinite(n)) {
            post(panel, { type: 'settingUpdateResult', key, ok: false, error: `Invalid number for ${key}` });
            break;
          }
          value = n;
        } else if (spec === 'string') {
          value = String(value ?? '');
        }
        // apiKey is stored in SecretStorage (never in plain settings).
        if (key === 'apiKey') {
          const ok = await activeConfig!.setApiKey(String(value ?? ''));
          post(panel, {
            type: 'settingUpdateResult',
            key,
            ok,
            error: ok ? '' : 'SecretStorage 写入失败',
          });
          break;
        }
        try {
          const cfg = activeConfig!.getConfiguration();

          await cfg.update(key, value, vscode.ConfigurationTarget.Global);
          if (key === 'toolProfile') {
            // Keep the in-memory filter in sync with the new global default.
            applyToolProfile(String(value ?? DEFAULT_TOOL_PROFILE));
          }
          refreshChatView();
          post(panel, { type: 'settingUpdateResult', key, ok: true });
        } catch (e: any) {
          post(panel, { type: 'settingUpdateResult', key, ok: false, error: String(e?.message ?? e) });
        }
        break;

      }

      case 'clearOverride': {
        // Remove workspace/folder-level overrides for one key so the GLOBAL
        // value takes effect again in this window.
        const key = typeof msg.key === 'string' ? msg.key : '';
        if (!SETTING_SPECS[key]) {
          post(panel, { type: 'clearOverrideResult', key, ok: false, error: `Unknown setting key: ${key}` });
          break;
        }
        try {
          const cfg = activeConfig!.getConfiguration();

          if (cfg.inspect(key)?.workspaceValue !== undefined) {
            await cfg.update(key, undefined, vscode.ConfigurationTarget.Workspace);
          }
          if (cfg.inspect(key)?.workspaceFolderValue !== undefined) {
            await cfg.update(key, undefined, vscode.ConfigurationTarget.WorkspaceFolder);
          }
          if (key === 'toolProfile') {
            // Re-apply the (now global) default so in-flight sessions see it.
            applyToolProfile(getCurrentToolProfile());
          }
          refreshChatView();
          post(panel, { type: 'clearOverrideResult', key, ok: true });
          post(panel, buildState()); // full refresh: settings + overrides
        } catch (e: any) {
          post(panel, { type: 'clearOverrideResult', key, ok: false, error: String(e?.message ?? e) });
        }
        break;
      }

      case 'saveProfile': {
        const id = typeof msg.id === 'string' ? msg.id.trim() : '';
        const res = saveToolProfile(id, {
          name: typeof msg.name === 'string' ? msg.name : '',
          description: typeof msg.description === 'string' ? msg.description : '',
          hiddenTools: Array.isArray(msg.hiddenTools) ? msg.hiddenTools.map((t: unknown) => String(t)) : [],
          disableReview: !!msg.disableReview,
          systemPrompt: typeof msg.systemPrompt === 'string' ? msg.systemPrompt : undefined,
        });
        if (res.ok) {
          // Reload the active filter so in-flight sessions see the change.
          applyToolProfile(getCurrentToolProfile());
          refreshChatView();
        }
        post(panel, {
          type: 'profileSaveResult',
          ok: res.ok,
          error: res.error ?? '',
          profileId: id,
          profiles: listToolProfilesDetailed(),
          currentProfile: getCurrentToolProfile(),
        });
        break;
      }

      case 'deleteProfile': {
        const id = typeof msg.id === 'string' ? msg.id.trim() : '';
        const res = deleteToolProfile(id);
        if (res.ok) {
          if (getCurrentToolProfile() === id) {
            applyToolProfile(DEFAULT_TOOL_PROFILE);
          }
          // If the global default pointed at the deleted profile, reset it.
          const cfg = activeConfig!.getConfiguration();

          if (cfg.get<string>('toolProfile', DEFAULT_TOOL_PROFILE) === id) {
            await cfg.update('toolProfile', DEFAULT_TOOL_PROFILE, vscode.ConfigurationTarget.Global);
          }
          refreshChatView();
        }
        post(panel, {
          type: 'profileDeleteResult',
          ok: res.ok,
          error: res.error ?? '',
          profileId: id,
          profiles: listToolProfilesDetailed(),
          currentProfile: getCurrentToolProfile(),
          settings: readSettingsSnapshot(),
        });
        break;
      }

      case 'openSettingsJson': {
        await vscode.commands.executeCommand('workbench.action.openSettingsJson');
        break;
      }

      case 'openProfilesFolder': {
        const dir = getProfilesDir();
        if (dir) {
          try {
            await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(dir));
          } catch {
            vscode.window.showInformationMessage(`Tool profiles directory: ${dir}`);
          }
        } else {
          vscode.window.showWarningMessage('Tool profiles directory is not initialized.');
        }
        break;
      }

      case 'close': {
        panel.dispose();
        break;
      }
    }
  });
}
