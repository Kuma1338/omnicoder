/**
 * FileRead Tool
 * Read file contents with optional line range, returns content with line numbers
 */

import type { Tool, ToolContext, ToolEvent } from './types';

export const fileReadTool: Tool = {
  name: 'file_read',
  description: 'Read the contents of a file. Returns content with line numbers. Supports optional line range.',
  isReadOnly: true,
  isConcurrencySafe: true,
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Absolute or relative path to the file',
      },
      offset: {
        type: 'number',
        description: 'Start reading from this line number (1-based)',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of lines to read',
      },
    },
    required: ['path'],
  },

  async *execute(input: Record<string, unknown>, context: ToolContext): AsyncGenerator<ToolEvent> {
    const rawPath = input.path as string;
    const offset = (input.offset as number) ?? 1;
    const limit = input.limit as number | undefined;

    // Resolve relative paths against working directory
    const path = rawPath.startsWith('/') || /^[A-Za-z]:/.test(rawPath)
      ? rawPath
      : `${context.workingDirectory}/${rawPath}`;

    try {
      const { readTextFile } = await import('@tauri-apps/plugin-fs');
      const content = await readTextFile(path);
      const lines = content.split('\n');

      const startLine = Math.max(1, offset) - 1; // 0-indexed
      const endLine = limit !== undefined ? startLine + limit : lines.length;
      const slice = lines.slice(startLine, endLine);

      const numbered = slice
        .map((line: string, i: number) => `${String(startLine + i + 1).padStart(4, ' ')}\t${line}`)
        .join('\n');

      yield {
        type: 'complete',
        result: numbered,
      };
    } catch (err) {
      yield { type: 'complete', result: `Error reading file: ${String(err)}` };
    }
  },
};
