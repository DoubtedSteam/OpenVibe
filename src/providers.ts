/**
 * Provider catalog — how to talk to different OpenAI-compatible API vendors.
 *
 * OpenVibe talks to any `/chat/completions` endpoint, but vendors disagree on
 * how "reasoning / thinking mode" is expressed in the request body:
 *
 *   - DeepSeek & 智谱 GLM  →  `thinking: { type: 'enabled' | 'disabled' }`
 *   - 硅基流动 / 阿里云百炼   →  `enable_thinking: true`   (Qwen3 / GLM / DeepSeek-V3.1 hybrids)
 *   - OpenAI o-series      →  `reasoning_effort: 'low' | 'medium' | 'high'`
 *   - OpenRouter           →  `reasoning: { effort }`
 *   - most local servers   →  no such field at all (unknown fields = HTTP 400)
 *
 * Sending DeepSeek-only fields to those endpoints is a hard error, so the
 * request body is shaped by a {@link ThinkingDialect} chosen from the active
 * provider preset (auto-detected from the Base URL when the id is `auto`).
 *
 * This module is pure data + pure functions: no `vscode` import, so it can be
 * used from `src/api.ts` (extension host) and from the settings dashboard.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

/** Known provider ids. `auto` = infer from the Base URL host. */
export type ProviderId =
  | 'auto'
  | 'deepseek'
  | 'siliconflow'
  | 'dashscope'
  | 'zhipu'
  | 'moonshot'
  | 'openai'
  | 'openrouter'
  | 'ollama'
  | 'generic';

/**
 * How a provider expresses (and disables) reasoning in the request body.
 *
 * - `thinking_type`     `thinking: { type }` (+ optional `reasoning_effort`)
 * - `enable_thinking`   `enable_thinking: true`
 * - `reasoning_effort`  `reasoning_effort: <level>`
 * - `reasoning`         `reasoning: { effort: <level> }`
 * - `none`              never send vendor-specific reasoning fields
 */
export type ThinkingDialect =
  | 'thinking_type'
  | 'enable_thinking'
  | 'reasoning_effort'
  | 'reasoning'
  | 'none';

/** All dialect ids, used to validate the per-model `thinkingMode` override. */
export const THINKING_DIALECTS: ThinkingDialect[] = [
  'thinking_type',
  'enable_thinking',
  'reasoning_effort',
  'reasoning',
  'none',
];

/** Human-readable labels for each dialect (settings UI + error hints). */
export const THINKING_DIALECT_LABELS: Record<ThinkingDialect, string> = {
  thinking_type: 'thinking.type —— DeepSeek / 智谱 GLM',
  enable_thinking: 'enable_thinking —— 硅基流动 / 阿里云百炼（Qwen3、GLM、DeepSeek-V3.1）',
  reasoning_effort: 'reasoning_effort —— OpenAI 推理模型',
  reasoning: 'reasoning.effort —— OpenRouter',
  none: '不发送（none）—— 最兼容，任何服务都可用',
};


/** Per-model `thinkingMode` override values (dialect ids + `auto`). */
export type ThinkingModeOverride = 'auto' | ThinkingDialect;

export interface ProviderPreset {
  id: ProviderId;
  /** Human-readable name shown in the dashboard / settings. */
  label: string;
  /** Default Base URL. Empty = user must supply their own. */
  baseUrl: string;
  /** Reasoning dialect used when the model entry does not override it. */
  thinking: ThinkingDialect;
  /** Whether `off/low/medium/high/max` levels are forwarded as effort values. */
  supportsEffortLevels: boolean;
  /** Vendor-specific notes rendered as helper text in the dashboard. */
  note?: string;
}

// ─── Catalog ─────────────────────────────────────────────────────────────────

export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: 'auto',
    label: '自动识别（按 Base URL）',
    baseUrl: '',
    thinking: 'none',
    supportsEffortLevels: false,
    note: '根据 Base URL 主机名自动匹配服务商；无法识别时按最保守的通用兼容模式发送，不携带任何厂商专有参数。',
  },
  {
    id: 'deepseek',
    label: 'DeepSeek 官方',
    baseUrl: 'https://api.deepseek.com',
    thinking: 'thinking_type',
    supportsEffortLevels: true,
    note: 'thinking.type + reasoning_effort（off 会发送 thinking.type=disabled）。',
  },
  {
    id: 'siliconflow',
    label: '硅基流动 SiliconFlow',
    baseUrl: 'https://api.siliconflow.cn/v1',
    thinking: 'enable_thinking',
    supportsEffortLevels: false,
    note: '使用 enable_thinking 开关（Qwen3 / GLM / DeepSeek-V3.1 等混合思考模型）。若模型不支持该参数，把思考强度设为「关闭」或将思考方言改为「不发送」。',
  },
  {
    id: 'dashscope',
    label: '阿里云百炼 DashScope',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    thinking: 'enable_thinking',
    supportsEffortLevels: false,
    note: '兼容模式端点，思考开关同样使用 enable_thinking。',
  },
  {
    id: 'zhipu',
    label: '智谱 GLM',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    thinking: 'thinking_type',
    supportsEffortLevels: false,
    note: 'GLM-4.5 及以上支持 thinking.type 开关（与 DeepSeek 写法一致，但不支持 reasoning_effort 档位）。',
  },
  {
    id: 'moonshot',
    label: '月之暗面 Kimi',
    baseUrl: 'https://api.moonshot.cn/v1',
    thinking: 'none',
    supportsEffortLevels: false,
    note: '标准 OpenAI 兼容接口，不发送任何思考参数。',
  },
  {
    id: 'openai',
    label: 'OpenAI 官方',
    baseUrl: 'https://api.openai.com/v1',
    thinking: 'reasoning_effort',
    supportsEffortLevels: true,
    note: '仅推理模型（o 系列 / GPT-5）接受 reasoning_effort；普通模型请将思考强度设为「关闭」。',
  },
  {
    id: 'openrouter',
    label: 'OpenRouter 聚合',
    baseUrl: 'https://openrouter.ai/api/v1',
    thinking: 'reasoning',
    supportsEffortLevels: true,
    note: '使用统一的 reasoning.effort 参数，具体支持度取决于所路由的底层模型。',
  },
  {
    id: 'ollama',
    label: '本地服务（Ollama / vLLM / LM Studio）',
    baseUrl: 'http://localhost:11434/v1',
    thinking: 'none',
    supportsEffortLevels: false,
    note: '本地推理服务通常对未知字段直接报错，因此不发送任何思考参数。',
  },
  {
    id: 'generic',
    label: '通用 OpenAI 兼容',
    baseUrl: '',
    thinking: 'none',
    supportsEffortLevels: false,
    note: '最保守模式：只发送标准 OpenAI 字段（model / messages / tools），兼容任何实现。',
  },
];

const PRESET_BY_ID = new Map<string, ProviderPreset>(PROVIDER_PRESETS.map((p) => [p.id, p]));

/** Host suffix → provider id, checked in order (first match wins). */
const HOST_RULES: Array<{ test: (host: string) => boolean; id: ProviderId }> = [
  { test: (h) => h.endsWith('api.deepseek.com') || h.endsWith('deepseek.com'), id: 'deepseek' },
  { test: (h) => h.includes('siliconflow'), id: 'siliconflow' },
  { test: (h) => h.includes('dashscope.aliyuncs.com') || h.includes('aliyuncs.com'), id: 'dashscope' },
  { test: (h) => h.includes('bigmodel.cn') || h.includes('zhipuai.cn'), id: 'zhipu' },
  { test: (h) => h.includes('moonshot.cn') || h.includes('moonshot.ai'), id: 'moonshot' },
  { test: (h) => h.endsWith('api.openai.com') || h === 'openai.com', id: 'openai' },
  { test: (h) => h.includes('openrouter.ai'), id: 'openrouter' },
  {
    test: (h) =>
      h === 'localhost' ||
      h.startsWith('localhost:') ||
      h === '127.0.0.1' ||
      h.startsWith('127.0.0.1:') ||
      h === '[::1]' ||
      h.startsWith('0.0.0.0') ||
      h.includes('host.docker.internal'),
    id: 'ollama',
  },
];

// ─── Lookup helpers ──────────────────────────────────────────────────────────

/** Look up a preset by id; returns `undefined` for unknown / `auto`. */
export function getProviderPreset(id?: string): ProviderPreset | undefined {
  if (!id) return undefined;
  return PRESET_BY_ID.get(String(id).trim().toLowerCase());
}

/** Extract the lowercase host from a Base URL. Returns `''` when unparseable. */
export function extractHost(baseUrl?: string): string {
  const raw = (baseUrl || '').trim();
  if (!raw) return '';
  try {
    return new URL(raw.includes('://') ? raw : `https://${raw}`).host.toLowerCase();
  } catch {
    return '';
  }
}

/**
 * Normalize a user-supplied Base URL into an origin+prefix we can append
 * `/chat/completions` to.
 *
 * 中转 / 自建端点最常见的三种写法都能吃下：
 *  - `https://x/v1/`            → `https://x/v1`
 *  - `https://x/v1/chat/completions` → `https://x/v1`
 *  - `x/v1`（漏协议头）          → `https://x/v1`
 */
export function normalizeBaseUrl(raw?: string): string {
  let url = (raw || '').trim();
  if (!url) return '';
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(url)) {
    // 本地 / 内网端点默认用 http（Ollama、one-api、vLLM 常见），其余补 https。
    const hostPart = url.split('/')[0].toLowerCase();
    const isLocal =
      hostPart === 'localhost' ||
      hostPart.startsWith('localhost:') ||
      hostPart.startsWith('127.') ||
      hostPart.startsWith('[::1]') ||
      hostPart.startsWith('0.0.0.0') ||
      /^10\.\d+\.\d+\.\d+(:\d+)?$/.test(hostPart) ||
      /^192\.168\.\d+\.\d+(:\d+)?$/.test(hostPart) ||
      /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+(:\d+)?$/.test(hostPart);
    url = `${isLocal ? 'http' : 'https'}://${url}`;
  }
  url = url.replace(/\/+$/, '');
  url = url.replace(/\/chat\/completions$/i, '');
  return url;
}

/** Infer a provider id from a Base URL. Falls back to `generic`. */
export function detectProviderFromBaseUrl(baseUrl?: string): ProviderId {
  const host = extractHost(baseUrl);
  if (!host) return 'generic';
  for (const rule of HOST_RULES) {
    if (rule.test(host)) return rule.id;
  }
  return 'generic';
}

/**
 * Resolve the effective provider preset.
 *
 * An explicit (non-`auto`) id always wins; otherwise the Base URL is inspected.
 */
export function resolveProvider(providerId?: string, baseUrl?: string): ProviderPreset {
  const explicit = getProviderPreset(providerId);
  if (explicit && explicit.id !== 'auto') return explicit;
  const detected = detectProviderFromBaseUrl(baseUrl);
  return PRESET_BY_ID.get(detected) ?? PRESET_BY_ID.get('generic')!;
}

/** True when a string is a known dialect id (used to validate overrides). */
export function isThinkingDialect(value?: string): value is ThinkingDialect {
  return !!value && (THINKING_DIALECTS as string[]).includes(value);
}

// ─── Thinking plan ───────────────────────────────────────────────────────────

export interface ThinkingPlan {
  /** Provider preset that produced this plan. */
  provider: ProviderPreset;
  /** Effective dialect after applying the per-model override. */
  dialect: ThinkingDialect;
  /** Whether reasoning/thinking should be requested. */
  enabled: boolean;
  /** Normalized effort level (`off` when disabled). */
  effort: string;
  /** Whether the effort level is forwarded as a numeric-ish hint. */
  sendsEffort: boolean;
}

/** Normalize a user-supplied effort string. Unknown values fall back to `high`. */
export function normalizeReasoningEffort(effort?: string): string {
  const value = (effort || '').trim().toLowerCase();
  if (['off', 'low', 'medium', 'high', 'max'].includes(value)) return value;
  return 'high';
}

/**
 * Decide how this request should express its thinking preference.
 *
 * @param providerId  Model-level provider id (or the global `apiProvider`).
 * @param baseUrl     Effective Base URL (used when `providerId` is `auto`).
 * @param override    Model-level `thinkingMode` (`auto` = follow the preset).
 * @param effort      User effort setting (`off/low/medium/high/max`).
 */
export function planThinking(
  providerId: string | undefined,
  baseUrl: string | undefined,
  override: string | undefined,
  effort: string | undefined
): ThinkingPlan {
  const provider = resolveProvider(providerId, baseUrl);
  const requested = (override || '').trim().toLowerCase();
  const dialect: ThinkingDialect = isThinkingDialect(requested) ? requested : provider.thinking;
  const normalized = normalizeReasoningEffort(effort);
  const enabled = normalized !== 'off';
  return {
    provider,
    dialect,
    enabled,
    effort: normalized,
    sendsEffort: enabled && provider.supportsEffortLevels,
  };
}

/** 硅基流动 `thinking_budget` 的合法区间（超出会被平台拒绝）。 */
export const THINKING_BUDGET_MIN = 128;
export const THINKING_BUDGET_MAX = 32768;

/** Clamp a user-supplied CoT budget into the vendor-accepted range. */
export function clampThinkingBudget(value?: number): number | undefined {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Math.min(THINKING_BUDGET_MAX, Math.max(THINKING_BUDGET_MIN, n));
}

/**
 * Build the vendor-specific reasoning fields for a request body.
 *
 * Semantics of "reasoning off" differ per dialect on purpose:
 * - `thinking_type`   → send `thinking: { type: 'disabled' }` (safe: only
 *                       DeepSeek / GLM style vendors ever read this key).
 * - `enable_thinking` → send `enable_thinking: false`. 混合思考模型（Qwen3 /
 *                       GLM / DeepSeek-V3.1）默认就是「开」，不发这个字段等于
 *                       关不掉思考，所以这里必须显式发 false；不支持该参数的
 *                       模型由 `sendChatMessage` 的 400 降级重试兜底。
 * - `reasoning_effort` / `reasoning` → 关闭时不发送（无通用的「关」写法）。
 * - `none`            → 任何情况下都不发送厂商专有字段（`off` 即万能兼容档）。
 *
 * @param opts.thinkingBudget CoT 预算（仅 `enable_thinking` 方言，目前用于硅基流动）。
 */
export function thinkingPayload(
  plan: ThinkingPlan,
  opts?: { thinkingBudget?: number }
): Record<string, unknown> {
  const { dialect, enabled, effort, sendsEffort } = plan;

  switch (dialect) {
    case 'thinking_type':
      return enabled
        ? { thinking: { type: 'enabled' }, ...(sendsEffort ? { reasoning_effort: effort } : {}) }
        : { thinking: { type: 'disabled' }, temperature: 0.0 };

    case 'enable_thinking': {
      if (!enabled) return { enable_thinking: false };
      const budget = clampThinkingBudget(opts?.thinkingBudget);
      return budget ? { enable_thinking: true, thinking_budget: budget } : { enable_thinking: true };
    }

    case 'reasoning_effort':
      return enabled ? { reasoning_effort: effort } : {};

    case 'reasoning':
      return enabled ? { reasoning: { effort } } : {};

    case 'none':
    default:
      return {};
  }
}

/** Response fields that may carry chain-of-thought, in priority order. */
export const REASONING_RESPONSE_FIELDS = ['reasoning_content', 'reasoning'] as const;

/**
 * Extract chain-of-thought text from an assistant message, tolerating the
 * different field names vendors use (`reasoning_content` vs `reasoning`).
 */
export function extractReasoningContent(message: any): string | null | undefined {
  if (!message) return undefined;
  for (const field of REASONING_RESPONSE_FIELDS) {
    const value = message[field];
    if (typeof value === 'string' && value.length > 0) return value;
    // OpenRouter may return `reasoning: { ... }`-shaped objects; ignore those.
  }
  return undefined;
}

/** `true` when an API error looks like a rejected / unknown request parameter. */
export function looksLikeUnknownParameterError(message: string): boolean {
  return /unknown|unrecognized|unsupported|not support|invalid[_ ]?(parameter|argument|request|field)|extra fields|additional properties|unexpected keyword/i.test(
    message
  );
}

/**
 * 厂商在「参数与模型不匹配」时报错信息里会点名具体字段，例如硅基流动：
 *   {"code":20015,"message":"Value error, current model does not support parameter `enable_thinking`."}
 * 这里抽出报错里提到的、我们确实会下发的字段名，供降级重试精确剔除。
 */
const DROPPABLE_PARAMS = [
  'thinking_budget',
  'enable_thinking',
  'reasoning_effort',
  'parallel_tool_calls',
  'tool_choice',
  'thinking',
  'reasoning',
  'temperature',
  'max_tokens',
] as const;

/** 400 报错中点名的、可以安全剔除的请求字段（按报错顺序无关）。 */
export function namedUnsupportedParams(message: string): string[] {
  return DROPPABLE_PARAMS.filter((key) => new RegExp(`\\b${key}\\b`, 'i').test(message));
}

/** 降级重试时可以整组剔除的厂商字段（报错未点名具体字段时使用）。 */
export const DROPPABLE_PARAM_KEYS: readonly string[] = DROPPABLE_PARAMS;

/** 剔除某个字段时应当一并剔除的关联字段（thinking_budget 依附 enable_thinking）。 */
export function withDependentParams(keys: readonly string[]): string[] {
  const out = new Set(keys);
  if (out.has('enable_thinking')) out.add('thinking_budget');
  return [...out];
}

/**
 * `true` when a 400 response means "prompt too long for this model" rather than
 * a malformed request. Wordings differ per vendor:
 *  - SiliconFlow / vLLM: `length of prompt_tokens (51353) must be less than max_seq_len (32768)`
 *  - OpenAI:             `This model's maximum context length is 8192 tokens…`
 *  - DashScope / 通义:    `Range of input length should be [1, 129024]`
 *  - 其他:               `max_total_tokens (…) must be less than or equal to max_seq_len (…)`
 */
export function looksLikeContextOverflow(message: string): boolean {
  return new RegExp(
    [
      'must be less than (?:or equal to )?max_seq_len',
      'max_total_tokens.*max_seq_len',
      'maximum context length',
      'context length.*(?:exceed|too long|limit)',
      'exceed[s]? the (?:model\'s )?(?:maximum )?context',
      'reduce the length of the messages',
      'prompt is too long',
      'range of input length',
      'too many tokens',
      'input is too long',
    ].join('|'),
    'i'
  ).test(message);
}

// ─── Context budget ──────────────────────────────────────────────────────────

/** 未显式设置输出预算时，为回复预留的 token 数。 */
export const DEFAULT_OUTPUT_RESERVE_TOKENS = 8192;

/** 压缩阈值至少保留窗口的这个比例，避免把用户配置成 0 导致疯狂压缩。 */
const MIN_THRESHOLD_RATIO = 0.5;

/** 压缩时保留的原始历史窗口最多占上下文窗口的这个比例。 */
const MAX_RESERVE_RATIO = 0.25;

export interface ContextBudget {
  /** 生效的上下文窗口（token）；0 = 未设置，沿用旧行为。 */
  contextWindow: number;
  /** prompt 达到该 token 数即触发历史压缩。 */
  compactThreshold: number;
  /** 压缩时原样保留的最近历史 token 数。 */
  reserveTokens: number;
  /** 请求体里下发的 `max_tokens`（0/undefined = 不下发，交给服务端默认）。 */
  maxTokens?: number;
  /** `thinking_budget`（仅 enable_thinking 方言）。 */
  thinkingBudget?: number;
}

export interface ContextBudgetInput {
  /** 用户配置的上下文窗口（token），0/undefined = 不启用精确控制。 */
  contextWindow?: number;
  /** 用户配置的单次回复上限（token），0/undefined = 不发送 max_tokens。 */
  maxOutputTokens?: number;
  /** 用户配置的思维链预算（token，硅基流动）。 */
  thinkingBudget?: number;
  /** 当前请求的思考计划（决定是否为 CoT 预留窗口）。 */
  plan: ThinkingPlan;
  /** 未配置 contextWindow 时使用的旧阈值（AUTO_COMPACT_TOKEN_THRESHOLD）。 */
  legacyThreshold: number;
  /** 未配置 contextWindow 时使用的旧保留窗口（COMPACT_RESERVE_TOKENS）。 */
  legacyReserveTokens: number;
}

/**
 * 把「上下文窗口 / 输出上限 / CoT 预算」换算成压缩阈值与保留窗口。
 *
 * 关键约束：`prompt + 回复 + 思维链 ≤ context_window`。所以压缩阈值取
 * `window - 输出预留 - CoT 预留`，并在窗口过小时兜底为窗口的一半。
 * 未设置 contextWindow 时完全退回旧行为（1M 阈值 / 20k 保留窗口），
 * 因此现有 DeepSeek 用户行为不变。
 */
export function computeContextBudget(input: ContextBudgetInput): ContextBudget {
  const window = Math.max(0, Math.floor(Number(input.contextWindow) || 0));
  const maxOutput = Math.max(0, Math.floor(Number(input.maxOutputTokens) || 0));
  const cotBudget =
    input.plan.enabled && input.plan.dialect === 'enable_thinking'
      ? clampThinkingBudget(input.thinkingBudget) ?? 0
      : 0;

  const outputReserve = maxOutput > 0 ? maxOutput : DEFAULT_OUTPUT_RESERVE_TOKENS;
  const budget: ContextBudget = {
    contextWindow: window,
    compactThreshold: input.legacyThreshold,
    reserveTokens: input.legacyReserveTokens,
    maxTokens: maxOutput > 0 ? maxOutput : undefined,
    thinkingBudget: cotBudget > 0 ? cotBudget : undefined,
  };

  if (window <= 0) return budget;

  budget.compactThreshold = Math.max(
    Math.floor(window * MIN_THRESHOLD_RATIO),
    window - outputReserve - cotBudget
  );
  budget.reserveTokens = Math.min(
    input.legacyReserveTokens,
    Math.max(2000, Math.floor(window * MAX_RESERVE_RATIO))
  );
  return budget;
}

/** 按当前 API 配置算上下文预算的便捷入口（内部自行推导思考计划）。 */
export function contextBudgetForConfig(
  config: {
    provider?: string;
    baseUrl?: string;
    thinkingMode?: string;
    reasoningEffort?: string;
    contextWindow?: number;
    maxOutputTokens?: number;
    thinkingBudget?: number;
  },
  legacy: { compactThreshold: number; reserveTokens: number }
): ContextBudget {
  const plan = planThinking(
    config.provider,
    config.baseUrl,
    config.thinkingMode,
    config.reasoningEffort
  );
  return computeContextBudget({
    contextWindow: config.contextWindow,
    maxOutputTokens: config.maxOutputTokens,
    thinkingBudget: config.thinkingBudget,
    plan,
    legacyThreshold: legacy.compactThreshold,
    legacyReserveTokens: legacy.reserveTokens,
  });
}
