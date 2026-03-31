/**
 * FileWrite Tool
 * Write content to a file (creates or overwrites)
 */

import type { Tool, ToolContext, ToolEvent } from './types';

export const fileWriteTool: Tool = {
  name: 'file_write',
  description: 'Write content to a file, creating it if it does not exist or overwriting if it does. Use file_edit for partial edits.',
  isReadOnly: false,
  isConcurrencySafe: false,
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Path to the file to write',
      },
      content: {
        type: 'string',
        description: 'Content to write to the file',
      },
    },
    required: ['path', 'content'],
  },

  async *execute(input: Record<string, unknown>, context: ToolContext): AsyncGenerator<ToolEvent> {
    if (!context.permissions.canEditFiles) {
      yield { type: 'complete', result: 'Error: This agent does not have permission to edit files.' };
      return;
    }

    const rawPath = input.path as string;
    const content = input.content as string;

    const path = rawPath.startsWith('/') || /^[A-Za-z]:/.test(rawPath)
      ? rawPath
      : `${context.workingDirectory}/${rawPath}`;

    // Request approval if needed
    if (context.requestApproval) {
      const approved = await context.requestApproval('write_file', `Write to ${path} (${content.length} bytes)`);
      if (!approved) {
        yield { type: 'complete', result: 'File write cancelled by user.' };
        return;
      }
    }

    try {
      const { writeTextFile, mkdir } = await import('@tauri-apps/plugin-fs');
      // Ensure parent directory exists
      const lastSlash = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
      if (lastSlash > 0) {
        const dir = path.substring(0, lastSlash);
        await mkdir(dir, { recursive: true }).catch(() => {});
      }
      await writeTextFile(path, content);
      yield { type: 'complete', result: `Successfully wrote ${content.split('\n').length} lines to ${path}` };
    } catch (err) {
      yield { type: 'complete', result: `Error writing file: ${String(err)}` };
    }
  },
};
