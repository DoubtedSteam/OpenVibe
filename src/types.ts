export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string; // JSON string
  };
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  /** DeepSeek reasoning model's thinking/chain-of-thought content. */
  reasoning_content?: string | null;
  /**
   * Persisted for chat UI / replay only. Omitted from {@link ConversationService.buildMessagesForLlm}
   * so tool-injected bubbles (e.g. todo list display) do not break the assistant/tool message sequence.
   */
  hiddenFromLlm?: boolean;
}

export interface AgentLogEntry {
  at: number;
  /** e.g. "codeEditReview", "shellEditor", "shellReview", "todolistReview", "todolistWriter" */
  agent: string;
  /** Free-form stage label like "request" | "response" | "error" */
  stage: string;
  /** Sanitized payload for debugging; keep it JSON-serializable. */
  data: any;
}

export interface GitSnapshot {
  id: string;
  timestamp: number;
  userInstruction: string;
  gitCommitHash?: string;
  gitTag?: string;
}

/** Mirrors in-memory todo state in {@link ToolExecutor}; persisted per session for reload. */
export interface AssistantTodoPersistedState {
  goal: string;
  items: { text: string; done: boolean }[];
}

export interface ChatSession {
  id: string;
  title: string;
  created: number;
  updated: number;
  messages: ChatMessage[];
  snapshots?: GitSnapshot[];
  agentLogs?: AgentLogEntry[];
  isActive?: boolean;
  /** Last assistant todo list (create_todo_list / complete_todo_item); restored after window reload. */
  assistantTodoState?: AssistantTodoPersistedState | null;
  /** Skill names activated in this conversation, loaded from global skills pool. */
  activatedSkills?: string[];
}

export interface ApiConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  /** Ask before applying **edit** tool (file changes). */
  confirmChanges?: boolean;
  /** Ask before running **run_shell_command** after review (independent from confirmChanges). */
  confirmShellCommand?: boolean;
  maxInteractions?: number; // -1 means unlimited
  maxSequenceLength?: number;
  /** Language for AI interaction: 'auto' | 'en' | 'zh-CN' */
  language?: string;
}
export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
}

export interface SkillInfo {
  name: string;
  description: string;
  /** Full instruction text (persona + behavior) extracted from SKILL.md */
  instruction: string;
  /** Sub-skills referenced in the SKILL.md frontmatter, e.g. ["skill-a", "skill-b"] */
  subSkills: string[];
}
export interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface HumanAssistanceResult {
  /** Unique request ID for tracking the confirmation. */
  requestId: string;
  /** The question/instruction that was presented to the user. */
  question: string;
  /** Timestamp when the user confirmed completion. */
  completedAt: number;
}

export interface HumanAssistanceParams {
  /** Instruction/question to present to the user. Describe clearly what the user needs to do. */
  question: string;
}

export interface WebFetchParams {
  /** Target URL to fetch (must start with http:// or https://). */
  url: string;
  /** Maximum text length to return (characters), default 16000. */
  maxLength?: number;
  /** Optional raw cookie string (e.g. "session=abc; token=xyz") for accessing authenticated pages. */
  cookie?: string;
  /** Optional custom headers as JSON string, e.g. '{"Authorization":"Bearer xxx"}'. */
  headers?: string;
  /** Timeout in milliseconds, default 15000. */
  timeoutMs?: number;
}

export interface WebFetchResult {
  /** Page title extracted from <title> tag. */
  title: string;
  /** Extracted plain-text content (truncated per maxLength). */
  content: string;
  /** Final URL (may differ from requested URL due to redirects). */
  url: string;
  /** HTTP status code. */
  statusCode: number;
  /** Content type header value (e.g. "text/html"). */
  contentType: string;
}