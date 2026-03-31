/**
 * TodoWrite Tool
 * Task management for agent-internal planning
 */

import type { Tool, ToolContext, ToolEvent } from './types';

export interface TodoItem {
  id: string;
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
  priority: 'high' | 'medium' | 'low';
}

// In-memory todo store per agent session
const todoStore = new Map<string, TodoItem[]>();

export const todoWriteTool: Tool = {
  name: 'todo_write',
  description: 'Create or update a task list. Use this to track your progress on multi-step tasks.',
  isReadOnly: false,
  isConcurrencySafe: false,
  inputSchema: {
    type: 'object',
    properties: {
      todos: {
        type: 'array',
        description: 'Array of todo items to set (replaces existing list)',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            content: { type: 'string' },
            status: { type: 'string', enum: ['pending', 'in_progress', 'completed'] },
            priority: { type: 'string', enum: ['high', 'medium', 'low'] },
          },
          required: ['id', 'content', 'status', 'priority'],
        },
      },
    },
    required: ['todos'],
  },

  async *execute(input: Record<string, unknown>, context: ToolContext): AsyncGenerator<ToolEvent> {
    const todos = input.todos as TodoItem[];
    todoStore.set(context.agentId, todos);

    const summary = todos.map((t) => {
      const icon = t.status === 'completed' ? '✅' : t.status === 'in_progress' ? '🔄' : '⬜';
      return `${icon} [${t.priority.toUpperCase()}] ${t.content}`;
    }).join('\n');

    yield { type: 'complete', result: `Task list updated:\n${summary}` };
  },
};

export function getTodos(agentId: string): TodoItem[] {
  return todoStore.get(agentId) ?? [];
}
