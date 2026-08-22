import * as vscode from 'vscode';
import type { ApiConfig, ModelConfig } from '../types';
import type { TodolistReviewSettings } from './todolistReview';
import type { ShellCommandReviewSettings } from './shellCommandReview';

/** SecretStorage key holding the OpenVibe API key (user-level, never workspace config). */
export const API_KEY_SECRET_KEY = 'openvibe.apiKey';

/**
 * Single source of truth for `vibe-coding.*` configuration defaults.
 * Must stay in sync with `contributes.configuration.properties` in package.json.
 */
export const CONFIG_DEFAULTS = {
  apiBaseUrl: 'https://api.deepseek.com',
  apiKey: '',
  model: 'deepseek-reasoner',
  models: [] as ModelConfig[],
  confirmChanges: true,
  confirmShellCommand: true,
  maxInteractions: -1,
  maxSequenceLength: 800000,
  language: 'zh-CN',
  reasoningEffort: 'high',
  toolProfile: 'full',
  memorySyncEnabled: true,
  editReviewEnabled: true,
  editReviewTimeoutMs: 120000,
  todolistReviewEnabled: true,
  todolistReviewMaxAttempts: 5,
  todolistReviewReviewTimeoutMs: 120000,
  todolistReviewEditorTimeoutMs: 120000,
  shellCommandReviewEnabled: true,
  shellCommandReviewTimeoutMs: 120000,
} as const;

/**
 * Central access point for all vibe-coding.* configuration reads.
 *
 * - Every getter falls back to {@link CONFIG_DEFAULTS} (same values as package.json).
 * - The API key is cached in memory and backed by SecretStorage (see {@link initialize}).
 * - `initialize()` must be called once from `activate()` before the chat view is used.
 */
export class ConfigService {
  private _apiKey = '';
  private _apiKeyLoaded = false;

  constructor(private readonly _context: vscode.ExtensionContext) {}

  /**
   * Preload the API key: SecretStorage first, then legacy `vibe-coding.apiKey`
   * settings (which is migrated into SecretStorage when found, but NOT cleared —
   * clearing is opt-in via the `vibe-coding.migrateApiKeyToSecretStorage` command).
   */
  async initialize(): Promise<void> {
    if (this._apiKeyLoaded) return;
    let key = '';
    try {
      key = (await this._context.secrets.get(API_KEY_SECRET_KEY)) ?? '';
    } catch {
      key = '';
    }
    if (!key) {
      const settingsKey = this._get('apiKey', CONFIG_DEFAULTS.apiKey);
      if (settingsKey) {
        key = settingsKey;
        try {
          await this._context.secrets.store(API_KEY_SECRET_KEY, key);
        } catch {
          /* SecretStorage write failure is not fatal; keep using the settings value. */
        }
      }
    }
    this._apiKey = key;
    this._apiKeyLoaded = true;
  }

  /** Cached API key (SecretStorage preferred, legacy settings fallback). Sync by design. */
  getApiKey(): string {
    return this._apiKey;
  }

  /** Persist a new API key into SecretStorage and refresh the in-memory cache. */
  async setApiKey(key: string): Promise<boolean> {
    try {
      await this._context.secrets.store(API_KEY_SECRET_KEY, key);
      this._apiKey = key;
      this._apiKeyLoaded = true;
      return true;
    } catch {
      return false;
    }
  }

  getApiBaseUrl(): string {
    return this._get('apiBaseUrl', CONFIG_DEFAULTS.apiBaseUrl);
  }

  getModel(): string {
    return this._get('model', CONFIG_DEFAULTS.model);
  }

  getModels(): ModelConfig[] {
    return this._get<ModelConfig[]>('models', []);
  }

  getLanguage(): string {
    return this._get('language', CONFIG_DEFAULTS.language);
  }

  /** Resolve the effective interaction language; `auto` detects from the VS Code UI language. */
  getResolvedLanguage(): string {
    const raw = this.getLanguage();
    if (raw === 'auto') {
      return vscode.env.language.startsWith('zh') ? 'zh-CN' : 'en';
    }
    return raw;
  }

  getConfirmChanges(): boolean {
    return this._get<boolean>('confirmChanges', CONFIG_DEFAULTS.confirmChanges) !== false;
  }

  getConfirmShellCommand(): boolean {
    return this._get<boolean>('confirmShellCommand', CONFIG_DEFAULTS.confirmShellCommand) !== false;
  }

  getMaxInteractions(): number {
    return this._get('maxInteractions', CONFIG_DEFAULTS.maxInteractions);
  }

  getMaxSequenceLength(): number {
    return this._get('maxSequenceLength', CONFIG_DEFAULTS.maxSequenceLength);
  }

  getReasoningEffort(): string {
    return this._get('reasoningEffort', CONFIG_DEFAULTS.reasoningEffort);
  }

  getToolProfile(): string {
    return this._get('toolProfile', CONFIG_DEFAULTS.toolProfile);
  }

  getMemorySyncEnabled(): boolean {
    return this._get<boolean>('memorySync.enabled', CONFIG_DEFAULTS.memorySyncEnabled) !== false;
  }

  getTodolistReviewSettings(): TodolistReviewSettings {
    return {
      enabled: this._get<boolean>('todolistReview.enabled', CONFIG_DEFAULTS.todolistReviewEnabled) !== false,
      maxAttempts: Math.max(1, this._get('todolistReview.maxAttempts', CONFIG_DEFAULTS.todolistReviewMaxAttempts)),
      reviewTimeoutMs: Math.max(
        5000,
        this._get('todolistReview.reviewTimeoutMs', CONFIG_DEFAULTS.todolistReviewReviewTimeoutMs)
      ),
      editorTimeoutMs: Math.max(
        5000,
        this._get('todolistReview.editorTimeoutMs', CONFIG_DEFAULTS.todolistReviewEditorTimeoutMs)
      ),
    };
  }

  getShellCommandReviewSettings(): ShellCommandReviewSettings {
    return {
      enabled: this._get<boolean>('shellCommandReview.enabled', CONFIG_DEFAULTS.shellCommandReviewEnabled) !== false,
      reviewTimeoutMs: Math.max(
        5000,
        this._get('shellCommandReview.reviewTimeoutMs', CONFIG_DEFAULTS.shellCommandReviewTimeoutMs)
      ),
    };
  }

  getEditReviewSettings(): { enabled: boolean; timeoutMs: number } {
    return {
      enabled: this._get<boolean>('editReview.enabled', CONFIG_DEFAULTS.editReviewEnabled) !== false,
      timeoutMs: Math.max(5000, this._get('editReview.timeoutMs', CONFIG_DEFAULTS.editReviewTimeoutMs)),
    };
  }


  /**
   * Build the effective ApiConfig for the given model selection.
   * Model entry overrides (apiBaseUrl/apiKey/maxInteractions/maxSequenceLength)
   * take precedence over the global vibe-coding.* settings.
   */
  getApiConfig(selectedModelIndex: number = -1): ApiConfig {
    const models = this.getModels();
    const baseUrl = this.getApiBaseUrl();
    const model = this.getModel();
    const apiKey = this.getApiKey();
    const maxInteractions = this.getMaxInteractions();
    const maxSequenceLength = this.getMaxSequenceLength();

    let effectiveIndex = selectedModelIndex;
    if (effectiveIndex < 0 && models.length > 0) {
      effectiveIndex = 0;
    }

    let activeBaseUrl = baseUrl;
    let activeApiKey = apiKey;
    let activeModelName = model;
    let activeMaxInteractions: number | undefined;
    let activeMaxSequenceLength: number | undefined;

    if (effectiveIndex >= 0 && effectiveIndex < models.length) {
      const entry = models[effectiveIndex];
      if (entry.apiBaseUrl) activeBaseUrl = entry.apiBaseUrl;
      if (entry.apiKey) activeApiKey = entry.apiKey;
      activeModelName = entry.model;
      if (entry.maxInteractions != null) activeMaxInteractions = entry.maxInteractions;
      if (entry.maxSequenceLength != null) activeMaxSequenceLength = entry.maxSequenceLength;
    }

    if (!activeApiKey) {
      throw new Error(
        'API key not configured. Please set vibe-coding.apiKey (or run the migrate command) or provide apiKey in vibe-coding.models in Settings.'
      );
    }

    return {
      baseUrl: activeBaseUrl,
      apiKey: activeApiKey,
      model: activeModelName,
      confirmChanges: this.getConfirmChanges(),
      confirmShellCommand: this.getConfirmShellCommand(),
      maxInteractions: activeMaxInteractions != null ? activeMaxInteractions : maxInteractions,
      maxSequenceLength: activeMaxSequenceLength != null ? activeMaxSequenceLength : maxSequenceLength,
      language: this.getResolvedLanguage(),
      reasoningEffort: this.getReasoningEffort(),
    };
  }

  /** Raw `vscode.workspace.getConfiguration('vibe-coding')` handle (used by the settings dashboard only). */
  getConfiguration(): vscode.WorkspaceConfiguration {
    return vscode.workspace.getConfiguration('vibe-coding');
  }

  private _get<T>(key: string, fallback: T): T {
    return vscode.workspace.getConfiguration('vibe-coding').get<T>(key, fallback);
  }
}

