/**
 * FileEdit Tool
 * Exact string replacement editor — replaces old_string with new_string
 * Fails if old_string not found or found multiple times (unless replace_all)
 */

import type { Tool, ToolContext, ToolEvent } from './types';

export const fileEditTool: Tool = {
  name: 'file_edit',
  description: 'Edit a file by replacing an exact string. The old_string must appear exactly once unless replace_all is true. Read the file first to get exact content.',
  isReadOnly: false,
  isConcurrencySafe: false,
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Path to the file to edit',
      },
      old_string: {
        type: 'string',
        description: 'The exact text to find and replace',
      },
      new_string: {
        type: 'string',
        description: 'The text to replace it with',
      },
      replace_all: {
        type: 'boolean',
        description: 'Replace all occurrences (default: false, fails if multiple found)',
      },
    },
    required: ['path', 'old_string', 'new_string'],
  },

  async *execute(input: Record<string, unknown>, context: ToolContext): AsyncGenerator<ToolEvent> {
    if (!context.permissions.canEditFiles) {
      yield { type: 'complete', result: 'Error: This agent does not have permission to edit files.' };
      return;
    }

    const rawPath = input.path as string;
    const oldString = input.old_string as string;
    const newString = input.new_string as string;
    const replaceAll = (input.replace_all as boolean) ?? false;

    const path = rawPath.startsWith('/') || /^[A-Za-z]:/.test(rawPath)
      ? rawPath
      : `${context.workingDirectory}/${rawPath}`;

    try {
      const { readTextFile, writeTextFile } = await import('@tauri-apps/plugin-fs');
      const content = await readTextFile(path);

      const occurrences = content.split(oldString).length - 1;

      if (occurrences === 0) {
        yield { type: 'complete', result: `Error: old_string not found in ${path}. Make sure to use the exact text including whitespace.` };
        return;
      }

      if (!replaceAll && occurrences > 1) {
        yield { type: 'complete', result: `Error: old_string found ${occurrences} times in ${path}. Provide more context to make it unique, or set replace_all: true.` };
        return;
      }

      const newContent = replaceAll
        ? content.split(oldString).join(newString)
        : content.replace(oldString, newString);

      if (context.requestApproval) {
        const approved = await context.requestApproval('edit_file', `Edit ${path}: replace ${occurrences} occurrence(s)`);
        if (!approved) {
          yield { type: 'complete', result: 'File edit cancelled by user.' };
          return;
        }
      }

      await writeTextFile(path, newContent);
      yield { type: 'complete', result: `Successfully edited ${path} (replaced ${occurrences} occurrence${occurrences > 1 ? 's' : ''})` };
    } catch (err) {
      yield { type: 'complete', result: `Error editing file: ${String(err)}` };
    }
  },
};
