/**
 * Tool Execution Engine
 * Handles concurrent execution with read/write partitioning:
 * - Read-only tools: parallel (up to MAX_CONCURRENT_READ)
 * - Write tools: serialized (one at a time)
 */

import type { Tool, ToolContext, ToolEvent } from './types';
import { globalToolRegistry } from './registry';

const MAX_CONCURRENT_READ = 10;

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResult {
  id: string;
  name: string;
  result: string;
  isError: boolean;
}

export type ToolProgressCallback = (callId: string, event: ToolEvent) => void;

async function runSingleTool(
  tool: Tool,
  call: ToolCall,
  context: ToolContext,
  onProgress?: ToolProgressCallback,
): Promise<ToolResult> {
  let finalResult = '';
  let isError = false;

  try {
    const gen = tool.execute(call.input, context);
    for await (const event of gen) {
      onProgress?.(call.id, event);
      if (event.type === 'complete') {
        finalResult = event.result;
      } else if (event.type === 'output' && event.isError) {
        isError = true;
      }
    }
  } catch (err) {
    finalResult = `Tool execution error: ${String(err)}`;
    isError = true;
  }

  return { id: call.id, name: call.name, result: finalResult, isError };
}

/**
 * Execute a batch of tool calls, respecting read/write concurrency rules.
 * Read-only tools run in parallel; write tools are serialized.
 */
export async function executeToolCalls(
  calls: ToolCall[],
  context: ToolContext,
  onProgress?: ToolProgressCallback,
): Promise<ToolResult[]> {
  const results: ToolResult[] = new Array(calls.length);

  // Partition into read and write
  const readCalls: Array<{ index: number; call: ToolCall; tool: Tool }> = [];
  const writeCalls: Array<{ index: number; call: ToolCall; tool: Tool }> = [];

  for (let i = 0; i < calls.length; i++) {
    const call = calls[i];
    const tool = globalToolRegistry.get(call.name);

    if (!tool) {
      results[i] = {
        id: call.id,
        name: call.name,
        result: `Unknown tool: ${call.name}`,
        isError: true,
      };
      continue;
    }

    if (tool.isReadOnly && tool.isConcurrencySafe) {
      readCalls.push({ index: i, call, tool });
    } else {
      writeCalls.push({ index: i, call, tool });
    }
  }

  // Execute read-only tools in parallel batches
  for (let i = 0; i < readCalls.length; i += MAX_CONCURRENT_READ) {
    const batch = readCalls.slice(i, i + MAX_CONCURRENT_READ);
    const batchResults = await Promise.all(
      batch.map(({ call, tool }) => runSingleTool(tool, call, context, onProgress)),
    );
    batch.forEach(({ index }, j) => {
      results[index] = batchResults[j];
    });
  }

  // Execute write tools serially
  for (const { index, call, tool } of writeCalls) {
    results[index] = await runSingleTool(tool, call, context, onProgress);
  }

  return results;
}
