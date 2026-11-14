import axios from 'axios';
import { ChatMessage, ApiConfig, ToolDefinition, ToolCall, TokenUsage } from './types';
import {
  computeContextBudget,
  DROPPABLE_PARAM_KEYS,
  extractReasoningContent,
  looksLikeContextOverflow,
  looksLikeUnknownParameterError,
  namedUnsupportedParams,
  normalizeBaseUrl,
  planThinking,
  thinkingPayload,
  withDependentParams,
} from './providers';
import { AUTO_COMPACT_TOKEN_THRESHOLD, COMPACT_RESERVE_TOKENS } from './constants';

/** 请求被上游判定为「上下文超限」时抛出，调用方据此压缩历史后重试。 */
export class ContextOverflowError extends Error {
  /** 上游原始报错文本（含 prompt/limit 数字，便于展示）。 */
  readonly detail: string;

  constructor(message: string, detail: string) {
    super(message);
    this.name = 'ContextOverflowError';
    this.detail = detail;
  }
}

export interface ApiResponse {
  content: string | null;
  toolCalls?: ToolCall[];
  /** DeepSeek reasoning model's thinking/chain-of-thought content. */
  reasoningContent?: string | null;
  tokenUsage?: TokenUsage;
}

export interface SendChatMessageOptions {
  /** Overrides default 120s axios timeout for this request. */
  timeoutMs?: number;
}

/**
 * 曾经被上游 400 拒绝过的请求字段，按「端点 + 模型 + 服务商预设 + 方言」记忆。
 * 命中后后续请求直接跳过这些字段，避免每条消息都先失败一次。
 */
const droppedParamsByModel = new Map<string, Set<string>>();

function modelKeyOf(config: ApiConfig): string {
  return [
    normalizeBaseUrl(config.baseUrl),
    config.model,
    config.provider ?? 'auto',
    config.thinkingMode ?? 'auto',
  ].join('|');
}

/** Test/reset hook: forget every remembered parameter rejection. */
export function resetParameterCompatibilityCache(): void {
  droppedParamsByModel.clear();
}

/** `true` when this endpoint+model combination had to drop vendor parameters. */
export function hasDroppedParameters(config: ApiConfig): boolean {
  const key = modelKeyOf(config);
  return (droppedParamsByModel.get(key)?.size ?? 0) > 0;
}

function errorDetail(error: any): string {
  const data = error?.response?.data;
  return (
    data?.error?.message ||
    data?.message ||
    (typeof data === 'string' ? data : '') ||
    error?.message ||
    'Unknown API error'
  );
}

function buildOverflowMessage(detail: string, contextWindow: number): string {
  return (
    `上下文超出模型上限：${detail}\n\n` +
    '请先在设置中心 → 📏 上下文控制 把「上下文窗口」设为该模型的实际值' +
    `（当前${contextWindow > 0 ? `：${contextWindow} tokens` : '未设置'}），` +
    '或手动执行压缩（compact）后重试。'
  );
}

/**
 * Send a (non-streaming) chat completion request to an OpenAI-compatible API.
 *
 * Vendor-agnostic:
 * - 思考/推理参数按服务商预设方言组装（见 `src/providers.ts`），不会把 DeepSeek
 *   专有字段发给会 400 的厂商；
 * - 若上游仍以「不支持的参数」拒绝，自动剔除被点名的字段并重试（最多 3 次），
 *   成功后记住该模型，后续不再发送这些字段 —— 这是硅基流动部分模型不支持
 *   `enable_thinking` 时的兜底路径；
 * - 上下文超限（OpenAI / 硅基流动 code 20015 / vLLM / DashScope 等各种措辞）统一
 *   抛 {@link ContextOverflowError}，由 MessageHandler 触发压缩后重试；
 * - 配置了上下文窗口时按 `window − 输出预留 − CoT 预留` 计算压缩阈值，并下发
 *   `max_tokens`（若配置）与 `thinking_budget`（硅基流动）。
 *
 * @param messages  Full message history (system/user/assistant/tool).
 * @param config    API provider configuration (baseUrl, apiKey, model, provider).
 * @param tools     Optional tool definitions for function calling.
 * @param signal    Optional AbortSignal to cancel the request.
 * @param options   Optional overrides (e.g. custom timeout).
 */
export async function sendChatMessage(
  messages: ChatMessage[],
  config: ApiConfig,
  tools?: ToolDefinition[],
  signal?: AbortSignal,
  options?: SendChatMessageOptions
): Promise<ApiResponse> {
  const url = `${normalizeBaseUrl(config.baseUrl)}/chat/completions`;

  // Reasoning models require `reasoning_content` to be passed back
  // on assistant messages. Transform the messages array to include it.
  const transformedMessages = messages.map((msg) => {
    const m: Record<string, unknown> = {
      role: msg.role,
      content: msg.content,
    };
    if (msg.role === 'assistant' && msg.reasoning_content !== undefined) {
      m.reasoning_content = msg.reasoning_content;
    }
    if (msg.tool_calls) {
      m.tool_calls = msg.tool_calls;
    }
    if (msg.tool_call_id) {
      m.tool_call_id = msg.tool_call_id;
    }
    return m;
  });

  const plan = planThinking(config.provider, config.baseUrl, config.thinkingMode, config.reasoningEffort);
  const budget = computeContextBudget({
    contextWindow: config.contextWindow,
    maxOutputTokens: config.maxOutputTokens,
    thinkingBudget: config.thinkingBudget,
    plan,
    legacyThreshold: AUTO_COMPACT_TOKEN_THRESHOLD,
    legacyReserveTokens: COMPACT_RESERVE_TOKENS,
  });

  // 该模型历史上被拒绝过的字段：直接不发。
  const key = modelKeyOf(config);
  const dropped = new Set<string>(droppedParamsByModel.get(key) ?? []);

  const buildPayload = (): Record<string, unknown> => {
    const payload: Record<string, unknown> = {
      model: config.model,
      messages: transformedMessages,
    };
    if (budget.maxTokens) {
      payload.max_tokens = budget.maxTokens;
    }
    // 思考参数按服务商方言下发（DeepSeek/GLM 用 thinking.type+reasoning_effort、
    // 硅基流动/百炼用 enable_thinking(+thinking_budget)、OpenAI 用 reasoning_effort）。
    // 思考模式下 temperature/top_p 等采样参数会被上游忽略。
    const vendor = thinkingPayload(plan, { thinkingBudget: budget.thinkingBudget });
    for (const [field, value] of Object.entries(vendor)) {
      if (!dropped.has(field)) payload[field] = value;
    }
    if (tools && tools.length > 0) {
      payload.tools = tools;
      if (!dropped.has('tool_choice')) payload.tool_choice = 'auto';
      if (!dropped.has('parallel_tool_calls')) payload.parallel_tool_calls = true;
    }
    return payload;
  };

  const maxAttempts = 3;
  let response: any;
  for (let attempt = 0; ; attempt++) {
    try {
      response = await axios.post(url, buildPayload(), {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`,
        },
        timeout: options?.timeoutMs ?? 120000,
        signal,
      });
      break;
    } catch (error: any) {
      // Aborted by caller (user clicked Stop)
      if (error.name === 'CanceledError' || error.code === 'ERR_CANCELED') {
        const abortErr = new Error('Operation stopped by user.');
        abortErr.name = 'AbortError';
        throw abortErr;
      }
      if (!axios.isAxiosError(error)) throw error;

      const status = error.response?.status;
      const detail = String(errorDetail(error));

      // ── 上下文超限：交给上层压缩后重试，不当作普通参数错误 ──────────
      if (status === 400 && looksLikeContextOverflow(detail)) {
        throw new ContextOverflowError(buildOverflowMessage(detail, budget.contextWindow), detail);
      }

      // ── 上游不认某个字段：剔除后重试（硅基流动部分模型不支持 enable_thinking）──
      if (status === 400 && looksLikeUnknownParameterError(detail) && attempt + 1 < maxAttempts) {
        const named = namedUnsupportedParams(detail);
        const candidates = named.length > 0 ? withDependentParams(named) : DROPPABLE_PARAM_KEYS;
        const added = candidates.filter((field) => !dropped.has(field));
        if (added.length > 0) {
          added.forEach((field) => dropped.add(field));
          droppedParamsByModel.set(key, dropped);
          continue;
        }
      }

      if (error.code === 'ECONNABORTED') {
        throw new Error('Request timed out. Please check your API endpoint and network connection.');
      }

      // 未识别参数（各服务商对未知字段的报错措辞不同）时，给出可操作的配置建议。
      const hint =
        status === 400 && looksLikeUnknownParameterError(detail)
          ? ` 提示：当前识别为服务商「${plan.provider.label}」/ 思考方言「${plan.dialect}」。请` +
            '在设置中心 → API 连接调整「服务商预设」，或把模型列表中的「思考方言」改为「不发送（none）」，' +
            '也可将思考强度设为「关闭」。'
          : '';
      throw new Error(`API error${status ? ` (${status})` : ''}: ${detail}${hint}`);
    }
  }

  const choice = response.data?.choices?.[0];
  if (!choice) {
    throw new Error('Invalid response from API: missing choices');
  }

  const msg = choice.message;
  const content: string | null = msg?.content ?? null;
  // 不同厂商的思维链字段不一致（DeepSeek/硅基流动用 reasoning_content，
  // OpenRouter 等用 reasoning），统一兼容读取。
  const reasoningContent = extractReasoningContent(msg);

  const toolCalls: ToolCall[] | undefined =
    Array.isArray(msg?.tool_calls) && msg.tool_calls.length > 0 ? msg.tool_calls : undefined;
  if (content === null && !toolCalls) {
    throw new Error('Invalid response from API: no content and no tool calls');
  }

  const tokenUsage = response.data?.usage
    ? {
        prompt_tokens: response.data.usage.prompt_tokens ?? 0,
        completion_tokens: response.data.usage.completion_tokens ?? 0,
        total_tokens: response.data.usage.total_tokens ?? 0,
      }
    : undefined;

  return { content, reasoningContent, toolCalls, tokenUsage };
}
