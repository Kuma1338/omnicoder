/**
 * Grep Tool
 * Content search using ripgrep (via Tauri backend)
 */

import type { Tool, ToolContext, ToolEvent } from './types';

export const grepTool: Tool = {
  name: 'grep',
  description: 'Search file contents using regex. Returns matching lines with file paths and line numbers. Supports glob filtering.',
  isReadOnly: true,
  isConcurrencySafe: true,
  inputSchema: {
    type: 'object',
    properties: {
      pattern: {
        type: 'string',
        description: 'Regular expression pattern to search for',
      },
      path: {
        type: 'string',
        description: 'File or directory to search in (defaults to working directory)',
      },
      glob: {
        type: 'string',
        description: 'Glob pattern to filter files (e.g., "*.ts")',
      },
      case_insensitive: {
        type: 'boolean',
        description: 'Case-insensitive search',
      },
      max_results: {
        type: 'number',
        description: 'Maximum number of results to return (default: 100)',
      },
    },
    required: ['pattern'],
  },

  async *execute(input: Record<string, unknown>, context: ToolContext): AsyncGenerator<ToolEvent> {
    const pattern = input.pattern as string;
    const searchPath = (input.path as string) ?? context.workingDirectory;
    const glob = input.glob as string | undefined;
    const caseInsensitive = (input.case_insensitive as boolean) ?? false;
    const maxResults = (input.max_results as number) ?? 100;

    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const results = await invoke<string[]>('grep_files', {
        pattern,
        path: searchPath,
        glob: glob ?? null,
        caseInsensitive,
        maxResults,
      });

      if (results.length === 0) {
        yield { type: 'complete', result: 'No matches found.' };
        return;
      }

      yield { type: 'complete', result: results.join('\n') };
    } catch (err) {
      yield { type: 'complete', result: `Error: ${String(err)}` };
    }
  },
};
