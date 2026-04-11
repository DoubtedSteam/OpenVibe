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
}

export interface GitSnapshot {
  id: string;
  timestamp: number;
  userInstruction: string;
  gitCommitHash?: string;
  gitTag?: string;
}

export interface ChatSession {
  id: string;
  title: string;
  created: number;
  updated: number;
  messages: ChatMessage[];
  snapshots?: GitSnapshot[];
  isActive?: boolean;
}

export interface ApiConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  confirmChanges?: boolean;
  maxInteractions?: number; // -1 means unlimited
  maxSequenceLength?: number;
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

export interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}