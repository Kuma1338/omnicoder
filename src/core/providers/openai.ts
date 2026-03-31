/**
 * OpenAI Provider Adapter
 * Translates between OmniCoder internal format (Anthropic-canonical) and OpenAI Chat API
 */

import type {
  IProvider,
  ProviderConfig,
  ProviderFeatures,
  Message,
  ToolDefinition,
  StreamChunk,
} from './types';

// --- Format Conversion: Internal → OpenAI ---

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string | null;
  tool_calls?: OpenAIToolCall[];
  tool_call_id?: string;
}

interface OpenAIToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

interface OpenAITool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

function convertMessagesToOpenAI(messages: Message[], systemPrompt?: string): OpenAIMessage[] {
  const result: OpenAIMessage[] = [];

  if (systemPrompt) {
    result.push({ role: 'system', content: systemPrompt });
  }

  for (const msg of messages) {
    if (typeof msg.content === 'string') {
      result.push({ role: msg.role, content: msg.content });
      continue;
    }

    // Process content blocks
    const textParts: string[] = [];
    const toolCalls: OpenAIToolCall[] = [];
    const toolResults: OpenAIMessage[] = [];

    for (const block of msg.content) {
      switch (block.type) {
        case 'text':
          textParts.push(block.text);
          break;

        case 'tool_use':
          toolCalls.push({
            id: block.id,
            type: 'function',
            function: {
              name: block.name,
              arguments: JSON.stringify(block.input),
            },
          });
          break;

        case 'tool_result':
          toolResults.push({
            role: 'tool',
            tool_call_id: block.tool_use_id,
            content: block.content,
          });
          break;

        case 'thinking':
          // OpenAI doesn't have a thinking block; skip or append as text
          break;

        case 'image':
          // Would need vision API format conversion
          textParts.push('[Image content - vision not yet supported for this provider]');
          break;
      }
    }

    if (msg.role === 'assistant') {
      const assistantMsg: OpenAIMessage = {
        role: 'assistant',
        content: textParts.length > 0 ? textParts.join('\n') : null,
      };
      if (toolCalls.length > 0) {
        assistantMsg.tool_calls = toolCalls;
      }
      result.push(assistantMsg);
    } else {
      // User message
      if (textParts.length > 0) {
        result.push({ role: 'user', content: textParts.join('\n') });
      }
    }

    // Add tool results as separate messages
    result.push(...toolResults);
  }

  return result;
}

function convertToolsToOpenAI(tools: ToolDefinition[]): OpenAITool[] {
  return tools.map((t) => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.input_schema,
    },
  }));
}

// --- OpenAI Provider ---

export class OpenAIProvider implements IProvider {
  readonly id: string;
  readonly type = 'openai' as const;
  readonly config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.id = config.id;
    this.config = config;
  }

  async *sendMessage(
    messages: Message[],
    tools?: ToolDefinition[],
    systemPrompt?: string,
  ): AsyncGenerator<StreamChunk> {
    const openaiMessages = convertMessagesToOpenAI(messages, systemPrompt);
    const openaiTools = tools && tools.length > 0 ? convertToolsToOpenAI(tools) : undefined;

    const body: Record<string, unknown> = {
      model: this.config.model,
      messages: openaiMessages,
      stream: true,
      max_tokens: this.config.maxTokens ?? 4096,
    };

    if (this.config.temperature !== undefined) {
      body.temperature = this.config.temperature;
    }

    if (openaiTools) {
      body.tools = openaiTools;
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.config.apiKey}`,
      ...this.config.customHeaders,
    };

    const baseUrl = this.config.baseUrl.replace(/\/$/, '');
    const url = `${baseUrl}/v1/chat/completions`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
    } catch (err) {
      yield { type: 'error', error: `Network error: ${String(err)}` };
      return;
    }

    if (!response.ok) {
      const errorText = await response.text();
      yield { type: 'error', error: `OpenAI API error ${response.status}: ${errorText}` };
      return;
    }

    if (!response.body) {
      yield { type: 'error', error: 'No response body' };
      return;
    }

    // Parse SSE stream
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let currentToolCallId = '';
    let currentToolCallName = '';
    let currentToolCallArgs = '';
    let inputTokens = 0;
    let outputTokens = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;
          const data = trimmed.slice(6);
          if (data === '[DONE]') {
            // Flush any pending tool call
            if (currentToolCallId) {
              try {
                const input = JSON.parse(currentToolCallArgs);
                yield {
                  type: 'tool_use',
                  id: currentToolCallId,
                  name: currentToolCallName,
                  input,
                };
              } catch {
                yield {
                  type: 'tool_use',
                  id: currentToolCallId,
                  name: currentToolCallName,
                  input: {},
                };
              }
              currentToolCallId = '';
              currentToolCallName = '';
              currentToolCallArgs = '';
            }

            yield {
              type: 'done',
              usage: { input_tokens: inputTokens, output_tokens: outputTokens },
            };
            return;
          }

          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta;
            const usage = parsed.usage;

            if (usage) {
              inputTokens = usage.prompt_tokens ?? 0;
              outputTokens = usage.completion_tokens ?? 0;
            }

            if (!delta) continue;

            // Text content
            if (delta.content) {
              yield { type: 'text', text: delta.content };
            }

            // Tool calls
            if (delta.tool_calls) {
              for (const tc of delta.tool_calls) {
                if (tc.id) {
                  // New tool call starting — flush previous if any
                  if (currentToolCallId) {
                    try {
                      const input = JSON.parse(currentToolCallArgs);
                      yield {
                        type: 'tool_use',
                        id: currentToolCallId,
                        name: currentToolCallName,
                        input,
                      };
                    } catch {
                      yield {
                        type: 'tool_use',
                        id: currentToolCallId,
                        name: currentToolCallName,
                        input: {},
                      };
                    }
                  }
                  currentToolCallId = tc.id;
                  currentToolCallName = tc.function?.name ?? '';
                  currentToolCallArgs = tc.function?.arguments ?? '';
                } else {
                  // Continuation of current tool call
                  currentToolCallArgs += tc.function?.arguments ?? '';
                }
              }
            }
          } catch {
            // Skip malformed JSON lines
          }
        }
      }
    } finally {
      // Flush any pending tool call on abnormal stream end
      if (currentToolCallId) {
        try {
          const input = currentToolCallArgs ? JSON.parse(currentToolCallArgs) : {};
          yield { type: 'tool_use', id: currentToolCallId, name: currentToolCallName, input };
        } catch {
          yield { type: 'tool_use', id: currentToolCallId, name: currentToolCallName, input: {} };
        }
      }
      reader.releaseLock();
    }

    yield { type: 'done', usage: { input_tokens: inputTokens, output_tokens: outputTokens } };
  }

  async testConnection(): Promise<{ success: boolean; error?: string; model?: string }> {
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
        ...this.config.customHeaders,
      };

      const baseUrl = this.config.baseUrl.replace(/\/$/, '');
      const response = await fetch(`${baseUrl}/v1/models`, { headers });

      if (!response.ok) {
        return { success: false, error: `HTTP ${response.status}: ${await response.text()}` };
      }

      const data = await response.json();
      const models = data.data?.map((m: { id: string }) => m.id) ?? [];
      const hasModel = models.includes(this.config.model);

      return {
        success: true,
        model: hasModel ? this.config.model : models[0],
      };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  }

  async listModels(): Promise<string[]> {
    try {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${this.config.apiKey}`,
        ...this.config.customHeaders,
      };

      const baseUrl = this.config.baseUrl.replace(/\/$/, '');
      const response = await fetch(`${baseUrl}/v1/models`, { headers });

      if (!response.ok) return [];
      const data = await response.json();
      return data.data?.map((m: { id: string }) => m.id) ?? [];
    } catch {
      return [];
    }
  }

  supportedFeatures(): ProviderFeatures {
    return {
      toolUse: true,
      parallelToolUse: true,
      vision: true,
      streaming: true,
      thinking: this.config.model.startsWith('o'),
      maxContextWindow: 128000,
      maxOutputTokens: 16384,
    };
  }
}
