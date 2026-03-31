/**
 * Anthropic Provider Adapter
 * Native format — internal messages are already Anthropic-canonical, minimal conversion needed
 */

import type {
  IProvider,
  ProviderConfig,
  ProviderFeatures,
  Message,
  ToolDefinition,
  StreamChunk,
} from './types';

export class AnthropicProvider implements IProvider {
  readonly id: string;
  readonly type = 'anthropic' as const;
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
    const body: Record<string, unknown> = {
      model: this.config.model,
      messages,
      max_tokens: this.config.maxTokens ?? 8192,
      stream: true,
    };

    if (systemPrompt) {
      body.system = systemPrompt;
    }

    if (this.config.temperature !== undefined) {
      body.temperature = this.config.temperature;
    }

    if (tools && tools.length > 0) {
      body.tools = tools;
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-api-key': this.config.apiKey ?? '',
      'anthropic-version': '2023-06-01',
      ...this.config.customHeaders,
    };

    const baseUrl = this.config.baseUrl.replace(/\/$/, '');
    const url = `${baseUrl}/v1/messages`;

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
      yield { type: 'error', error: `Anthropic API error ${response.status}: ${errorText}` };
      return;
    }

    if (!response.body) {
      yield { type: 'error', error: 'No response body' };
      return;
    }

    // Parse Anthropic SSE stream
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let inputTokens = 0;
    let outputTokens = 0;
    let currentToolId = '';
    let currentToolName = '';
    let currentToolInput = '';

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

          try {
            const event = JSON.parse(data);

            switch (event.type) {
              case 'message_start':
                inputTokens = event.message?.usage?.input_tokens ?? 0;
                break;

              case 'content_block_start':
                if (event.content_block?.type === 'tool_use') {
                  currentToolId = event.content_block.id;
                  currentToolName = event.content_block.name;
                  currentToolInput = '';
                }
                break;

              case 'content_block_delta':
                if (event.delta?.type === 'text_delta') {
                  yield { type: 'text', text: event.delta.text };
                } else if (event.delta?.type === 'thinking_delta') {
                  yield { type: 'thinking', thinking: event.delta.thinking };
                } else if (event.delta?.type === 'input_json_delta') {
                  currentToolInput += event.delta.partial_json;
                }
                break;

              case 'content_block_stop':
                if (currentToolId) {
                  try {
                    const input = currentToolInput ? JSON.parse(currentToolInput) : {};
                    yield {
                      type: 'tool_use',
                      id: currentToolId,
                      name: currentToolName,
                      input,
                    };
                  } catch {
                    yield {
                      type: 'tool_use',
                      id: currentToolId,
                      name: currentToolName,
                      input: {},
                    };
                  }
                  currentToolId = '';
                  currentToolName = '';
                  currentToolInput = '';
                }
                break;

              case 'message_delta':
                outputTokens = event.usage?.output_tokens ?? outputTokens;
                break;

              case 'message_stop':
                yield {
                  type: 'done',
                  usage: { input_tokens: inputTokens, output_tokens: outputTokens },
                };
                return;

              case 'error':
                yield { type: 'error', error: event.error?.message ?? 'Unknown error' };
                return;
            }
          } catch {
            // Skip malformed JSON
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    yield { type: 'done', usage: { input_tokens: inputTokens, output_tokens: outputTokens } };
  }

  async testConnection(): Promise<{ success: boolean; error?: string; model?: string }> {
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'x-api-key': this.config.apiKey ?? '',
        'anthropic-version': '2023-06-01',
        ...this.config.customHeaders,
      };

      const baseUrl = this.config.baseUrl.replace(/\/$/, '');

      // Send a minimal message to test
      const response = await fetch(`${baseUrl}/v1/messages`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: this.config.model,
          messages: [{ role: 'user', content: 'hi' }],
          max_tokens: 1,
        }),
      });

      if (!response.ok) {
        return { success: false, error: `HTTP ${response.status}: ${await response.text()}` };
      }

      return { success: true, model: this.config.model };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  }

  supportedFeatures(): ProviderFeatures {
    const isOpus = this.config.model.includes('opus');
    return {
      toolUse: true,
      parallelToolUse: true,
      vision: true,
      streaming: true,
      thinking: true,
      maxContextWindow: 200000,
      maxOutputTokens: isOpus ? 32000 : 16000,
    };
  }
}
