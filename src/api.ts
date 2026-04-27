import axios from 'axios';
import { ChatMessage, ApiConfig, ToolDefinition, ToolCall, TokenUsage } from './types';

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

export async function sendChatMessage(
  messages: ChatMessage[],
  config: ApiConfig,
  tools?: ToolDefinition[],
  signal?: AbortSignal,
  options?: SendChatMessageOptions
): Promise<ApiResponse> {
  const url = `${config.baseUrl}/chat/completions`;

  // DeepSeek reasoning models require `reasoning_content` to be passed back
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

  const payload: Record<string, unknown> = {
    model: config.model,
    messages: transformedMessages,
    temperature: 0.0,
  };

  if (tools && tools.length > 0) {
    payload.tools = tools;
    payload.tool_choice = 'auto';
    payload.parallel_tool_calls = true;
  }

  try {
    const response = await axios.post(url, payload, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      timeout: options?.timeoutMs ?? 120000,
      signal,
    });

    const choice = response.data?.choices?.[0];
    if (!choice) {
      throw new Error('Invalid response from API: missing choices');
    }

    const msg = choice.message;
    const content: string | null = msg?.content ?? null;
    const reasoningContent: string | null | undefined = msg?.reasoning_content ?? undefined;
    const toolCalls: ToolCall[] | undefined =
      Array.isArray(msg?.tool_calls) && msg.tool_calls.length > 0
        ? msg.tool_calls
        : undefined;
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
  } catch (error: any) {
    // Aborted by caller (user clicked Stop)
    if (error.name === 'CanceledError' || error.code === 'ERR_CANCELED') {
      const abortErr = new Error('Operation stopped by user.');
      abortErr.name = 'AbortError';
      throw abortErr;
    }
    if (axios.isAxiosError(error)) {
      if (error.code === 'ECONNABORTED') {
        throw new Error('Request timed out. Please check your API endpoint and network connection.');
      }
      const status = error.response?.status;
      const detail = error.response?.data?.error?.message || error.message;
      throw new Error(`API error${status ? ` (${status})` : ''}: ${detail}`);
    }
    throw error;
  }
}


/**
 * Stream a chat completion request via SSE and call back for content deltas.
 * Returns the fully assembled ApiResponse (content + optional toolCalls + tokenUsage).
 *
 * Streaming logic:
 * 1. Sends POST with `stream: true`
 * 2. Parses SSE `data: ...` lines from the response body
 * 3. Calls `onReasoning(delta)` / `onContent(delta)` for each text delta
 * 4. On stream end, assembles tool_calls and token_usage from final chunks
 * 5. Fallback: on error, returns what was accumulated so far
 */
export async function streamChatMessage(
  messages: ChatMessage[],
  config: ApiConfig,
  tools: ToolDefinition[] | undefined,
  signal: AbortSignal | undefined,
  callbacks?: {
    onReasoning?: (delta: string) => void;
    onContent?: (delta: string) => void;
  }
): Promise<ApiResponse> {
  const url = `${config.baseUrl}/chat/completions`;

  const transformedMessages = messages.map((msg) => {
    const m: Record<string, unknown> = { role: msg.role, content: msg.content };
    if (msg.role === 'assistant' && msg.reasoning_content !== undefined) {
      m.reasoning_content = msg.reasoning_content;
    }
    if (msg.tool_calls) { m.tool_calls = msg.tool_calls; }
    if (msg.tool_call_id) { m.tool_call_id = msg.tool_call_id; }
    return m;
  });

  const payload: Record<string, unknown> = {
    model: config.model,
    messages: transformedMessages,
    temperature: 0.0,
    stream: true,
  };
  if (tools && tools.length > 0) {
    payload.tools = tools;
    payload.tool_choice = 'auto';
    payload.parallel_tool_calls = true;
  }

  let accumulatedContent = '';
  let accumulatedReasoning = '';
  // Tool calls are assembled incrementally across chunks
  const toolCallAccumulators: Map<number, { id: string; type: string; name: string; arguments: string }> = new Map();
  let finalTokenUsage: TokenUsage | undefined;
  let hadToolCalls = false;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(payload),
      signal,
    });

    if (!response.ok) {
      let detail = `HTTP ${response.status}`;
      try {
        const errBody = await response.text();
        const parsed = JSON.parse(errBody);
        detail = parsed?.error?.message || parsed?.error || detail;
      } catch { /* ignore parse errors */ }
      throw new Error(`API error (${response.status}): ${detail}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('Response body is not readable');

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line in buffer

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        const data = trimmed.slice(6);
        if (data === '[DONE]') continue;

        try {
          const parsed = JSON.parse(data);
          const choice = parsed?.choices?.[0];
          if (!choice) {
            // Some providers send usage in a separate chunk with no choices
            if (parsed.usage) {
              finalTokenUsage = {
                prompt_tokens: parsed.usage.prompt_tokens ?? 0,
                completion_tokens: parsed.usage.completion_tokens ?? 0,
                total_tokens: parsed.usage.total_tokens ?? 0,
              };
            }
            continue;
          }

          const delta = choice.delta || {};

          // Reasoning content (DeepSeek reasoning models)
          if (delta.reasoning_content) {
            accumulatedReasoning += delta.reasoning_content;
            callbacks?.onReasoning?.(delta.reasoning_content);
          }

          // Text content
          if (delta.content) {
            accumulatedContent += delta.content;
            callbacks?.onContent?.(delta.content);
          }

          // Tool calls (can arrive incrementally across chunks)
          if (delta.tool_calls) {
            hadToolCalls = true;
            for (const tc of delta.tool_calls) {
              const idx = tc.index ?? 0;
              let acc = toolCallAccumulators.get(idx);
              if (!acc) {
                acc = { id: tc.id || '', type: tc.type || 'function', name: '', arguments: '' };
                toolCallAccumulators.set(idx, acc);
              }
              if (tc.id) acc.id = tc.id;
              if (tc.type) acc.type = tc.type;
              if (tc.function?.name) acc.name = tc.function.name;
              if (tc.function?.arguments) acc.arguments += tc.function.arguments;
            }
          }

          // Finish reason
          if (choice.finish_reason === 'tool_calls') {
            hadToolCalls = true;
          }
        } catch {
          // Skip malformed JSON lines
        }
      }
    }

    // Assemble tool calls from accumulators
    let toolCalls: ToolCall[] | undefined;
    if (hadToolCalls && toolCallAccumulators.size > 0) {
      toolCalls = Array.from(toolCallAccumulators.entries())
        .sort(([a], [b]) => a - b)
        .map(([, acc]) => ({
          id: acc.id,
          type: 'function' as const,
          function: {
            name: acc.name,
            arguments: acc.arguments,
          },
        }));
    }

    return {
      content: accumulatedContent || null,
      reasoningContent: accumulatedReasoning || null,
      toolCalls: toolCalls && toolCalls.length > 0 ? toolCalls : undefined,
      tokenUsage: finalTokenUsage,
    };
  } catch (error: any) {
    if (error.name === 'AbortError') {
      const abortErr = new Error('Operation stopped by user.');
      abortErr.name = 'AbortError';
      throw abortErr;
    }
    // Return what we've accumulated so far (partial data)
    if (accumulatedContent || hadToolCalls) {
      let toolCalls: ToolCall[] | undefined;
      if (hadToolCalls && toolCallAccumulators.size > 0) {
        toolCalls = Array.from(toolCallAccumulators.entries())
          .sort(([a], [b]) => a - b)
          .map(([, acc]) => ({
            id: acc.id,
            type: 'function' as const,
            function: { name: acc.name, arguments: acc.arguments },
          }));
      }
      return {
        content: accumulatedContent || null,
        reasoningContent: accumulatedReasoning || null,
        toolCalls: toolCalls && toolCalls.length > 0 ? toolCalls : undefined,
        tokenUsage: finalTokenUsage,
      };
    }
    throw error;
  }
}