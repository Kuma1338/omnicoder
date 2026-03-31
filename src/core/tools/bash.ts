/**
 * Bash Tool
 * Execute shell commands with timeout and output streaming
 */

import type { Tool, ToolContext, ToolEvent } from './types';

export const bashTool: Tool = {
  name: 'bash',
  description: 'Execute a shell command and return its output. Use for running tests, installing packages, building projects, etc.',
  isReadOnly: false,
  isConcurrencySafe: false,
  inputSchema: {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: 'The shell command to execute',
      },
      timeout: {
        type: 'number',
        description: 'Timeout in milliseconds (default: 30000, max: 300000)',
      },
      cwd: {
        type: 'string',
        description: 'Working directory for the command (defaults to project working directory)',
      },
    },
    required: ['command'],
  },

  async *execute(input: Record<string, unknown>, context: ToolContext): AsyncGenerator<ToolEvent> {
    const command = input.command as string;
    const timeout = Math.min((input.timeout as number) ?? 30000, 300000);
    const cwd = (input.cwd as string) ?? context.workingDirectory;

    if (!context.permissions.canRunBash) {
      yield { type: 'complete', result: 'Error: This agent does not have permission to run bash commands.' };
      return;
    }

    yield { type: 'progress', message: `$ ${command}` };

    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const result = await invoke<{ stdout: string; stderr: string; exit_code: number }>('run_command', {
        command,
        cwd,
        timeout,
      });

      const output = [
        result.stdout,
        result.stderr ? `[stderr]: ${result.stderr}` : '',
      ].filter(Boolean).join('\n');

      if (result.exit_code !== 0) {
        yield { type: 'output', content: output, isError: true };
        yield { type: 'complete', result: `Command exited with code ${result.exit_code}\n${output}` };
      } else {
        yield { type: 'output', content: output };
        yield { type: 'complete', result: output || '(no output)' };
      }
    } catch (err) {
      yield { type: 'complete', result: `Error executing command: ${String(err)}` };
    }
  },
};
