/**
 * Single Agent Mode
 * Manages a single agent's message loop:
 * user input → provider call → tool execution → loop until done
 */

import type { IProvider } from '../providers/types';
import type { Message, ToolDefinition, ContentBlock, ToolResultContent } from '../providers/types';
import type { ToolContext } from '../tools/types';
import { globalToolRegistry } from '../tools/registry';
import { executeToolCalls } from '../tools/executor';
import type { ToolCall } from '../tools/executor';

export type AgentEvent =
  | { type: 'text'; text: string }
  | { type: 'thinking'; thinking: string }
  | { type: 'tool_start'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; id: string; name: string; result: string; isError: boolean }
  | { type: 'done'; usage: { input_tokens: number; output_tokens: number }; messages: Message[] }
  | { type: 'error'; error: string };

export interface SingleAgentConfig {
  provider: IProvider;
  systemPrompt?: string;
  workingDirectory: string;
  agentId: string;
  agentRole: string;
  autoApproveTools?: boolean;
  requestApproval?: (action: string, detail: string) => Promise<boolean>;
}

/**
 * Convert registry tools to provider tool definitions
 */
function getToolDefinitions(context: ToolContext): ToolDefinition[] {
  return globalToolRegistry.getByPermission(context).map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.inputSchema as ToolDefinition['input_schema'],
  }));
}

/**
 * Run a single agent turn: send messages, handle tool calls, repeat until no more tools
 */
export async function* runAgentTurn(
  messages: Message[],
  config: SingleAgentConfig,
): AsyncGenerator<AgentEvent> {
  const context: ToolContext = {
    workingDirectory: config.workingDirectory,
    agentId: config.agentId,
    agentRole: config.agentRole,
    permissions: {
      canEditFiles: true,
      canRunBash: true,
      canAccessNetwork: true,
    },
    requestApproval: config.autoApproveTools ? undefined : config.requestApproval,
  };

  const tools = getToolDefinitions(context);
  let currentMessages = [...messages];
  let totalInput = 0;
  let totalOutput = 0;

  const MAX_ITERATIONS = 25;
  // Agentic loop: keep going while model returns tool calls
  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    if (iteration === MAX_ITERATIONS - 1) {
      yield { type: 'error', error: `Agent exceeded maximum tool iterations (${MAX_ITERATIONS}). Stopping to prevent infinite loop.` };
      break;
    }
    const pendingToolCalls: ToolCall[] = [];
    const assistantBlocks: ContentBlock[] = [];

    // Stream provider response
    for await (const chunk of config.provider.sendMessage(
      currentMessages,
      tools,
      config.systemPrompt,
    )) {
      switch (chunk.type) {
        case 'text':
          yield { type: 'text', text: chunk.text };
          assistantBlocks.push({ type: 'text', text: chunk.text });
          break;

        case 'thinking':
          yield { type: 'thinking', thinking: chunk.thinking };
          break;

        case 'tool_use':
          yield { type: 'tool_start', id: chunk.id, name: chunk.name, input: chunk.input };
          pendingToolCalls.push({ id: chunk.id, name: chunk.name, input: chunk.input });
          assistantBlocks.push({
            type: 'tool_use',
            id: chunk.id,
            name: chunk.name,
            input: chunk.input,
          });
          break;

        case 'done':
          totalInput += chunk.usage?.input_tokens ?? 0;
          totalOutput += chunk.usage?.output_tokens ?? 0;
          break;

        case 'error':
          yield { type: 'error', error: chunk.error };
          return;
      }
    }

    // Append assistant message to history
    if (assistantBlocks.length > 0) {
      currentMessages = [
        ...currentMessages,
        { role: 'assistant' as const, content: assistantBlocks },
      ];
    }

    // If no tool calls, we're done
    if (pendingToolCalls.length === 0) break;

    // Execute tools
    const results = await executeToolCalls(pendingToolCalls, context, (_callId, event) => {
      if (event.type === 'progress') {
        // Progress events are just informational
      }
    });

    // Emit tool results and build tool_result blocks
    const toolResultBlocks: ToolResultContent[] = [];
    for (const result of results) {
      yield { type: 'tool_result', id: result.id, name: result.name, result: result.result, isError: result.isError };
      toolResultBlocks.push({
        type: 'tool_result',
        tool_use_id: result.id,
        content: result.result,
        is_error: result.isError,
      });
    }

    // Append tool results as user message
    currentMessages = [
      ...currentMessages,
      { role: 'user' as const, content: toolResultBlocks },
    ];
  }

  yield { type: 'done', usage: { input_tokens: totalInput, output_tokens: totalOutput }, messages: currentMessages };
}
