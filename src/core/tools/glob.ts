/**
 * Glob Tool
 * Find files matching a glob pattern, sorted by modification time
 */

import type { Tool, ToolContext, ToolEvent } from './types';

export const globTool: Tool = {
  name: 'glob',
  description: 'Find files matching a glob pattern (e.g., "**/*.ts", "src/**/*.tsx"). Returns matching paths sorted by modification time.',
  isReadOnly: true,
  isConcurrencySafe: true,
  inputSchema: {
    type: 'object',
    properties: {
      pattern: {
        type: 'string',
        description: 'Glob pattern to match files (e.g., "**/*.ts")',
      },
      path: {
        type: 'string',
        description: 'Directory to search in (defaults to working directory)',
      },
    },
    required: ['pattern'],
  },

  async *execute(input: Record<string, unknown>, context: ToolContext): AsyncGenerator<ToolEvent> {
    const pattern = input.pattern as string;
    const searchPath = (input.path as string) ?? context.workingDirectory;

    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const matches = await invoke<string[]>('glob_files', { pattern, path: searchPath });

      if (matches.length === 0) {
        yield { type: 'complete', result: 'No files found matching pattern.' };
        return;
      }

      yield { type: 'complete', result: matches.join('\n') };
    } catch (err) {
      yield { type: 'complete', result: `Error: ${String(err)}` };
    }
  },
};
