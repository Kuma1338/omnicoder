/**
 * OmniCoder Provider Types
 * Unified interface for all AI backends (Anthropic, OpenAI, Gemini, Ollama, Custom)
 */

// --- Provider Configuration ---

export type ProviderType = 'anthropic' | 'openai' | 'gemini' | 'ollama' | 'custom';

export interface ProxyConfig {
  host: string;
  port: number;
  protocol: 'http' | 'https' | 'socks5';
  auth?: {
    username: string;
    password: string;
  };
}

export interface ProviderConfig {
  id: string;
  name: string;
  type: ProviderType;
  apiKey?: string;
  baseUrl: string;
  model: string;
  proxy?: ProxyConfig;
  maxTokens?: number;
  temperature?: number;
  customHeaders?: Record<string, string>;
  enabled?: boolean;
}

// --- Provider Features & Capabilities ---

export interface ProviderFeatures {
  toolUse: boolean;
  parallelToolUse: boolean;
  vision: boolean;
  streaming: boolean;
  thinking: boolean;
  maxContextWindow: number;
  maxOutputTokens: number;
}

// --- Internal Message Format (Anthropic-canonical) ---

export type MessageRole = 'user' | 'assistant';

export interface TextContent {
  type: 'text';
  text: string;
}

export interface ToolUseContent {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResultContent {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

export interface ImageContent {
  type: 'image';
  source: {
    type: 'base64';
    media_type: string;
    data: string;
  };
}

export interface ThinkingContent {
  type: 'thinking';
  thinking: string;
}

export type ContentBlock =
  | TextContent
  | ToolUseContent
  | ToolResultContent
  | ImageContent
  | ThinkingContent;

export interface Message {
  role: MessageRole;
  content: ContentBlock[] | string;
}

// --- Tool Definition ---

export interface ToolParameter {
  type: string;
  description?: string;
  enum?: string[];
  items?: ToolParameter;
  properties?: Record<string, ToolParameter>;
  required?: string[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, ToolParameter>;
    required?: string[];
  };
}

// --- Streaming ---

export interface StreamChunkText {
  type: 'text';
  text: string;
}

export interface StreamChunkToolUse {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface StreamChunkThinking {
  type: 'thinking';
  thinking: string;
}

export interface StreamChunkDone {
  type: 'done';
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
  stop_reason?: string;
}

export interface StreamChunkError {
  type: 'error';
  error: string;
}

export type StreamChunk =
  | StreamChunkText
  | StreamChunkToolUse
  | StreamChunkThinking
  | StreamChunkDone
  | StreamChunkError;

// --- Provider Interface ---

export interface IProvider {
  readonly id: string;
  readonly type: ProviderType;
  readonly config: ProviderConfig;

  sendMessage(
    messages: Message[],
    tools?: ToolDefinition[],
    systemPrompt?: string,
  ): AsyncGenerator<StreamChunk>;

  testConnection(): Promise<{ success: boolean; error?: string; model?: string }>;

  listModels?(): Promise<string[]>;

  supportedFeatures(): ProviderFeatures;
}

// --- Provider Registry ---

export interface ProviderPreset {
  id: string;
  name: string;
  type: ProviderType;
  baseUrl: string;
  defaultModel: string;
  description: string;
  models?: string[];
  category: 'official' | 'relay' | 'local' | 'community';
}
