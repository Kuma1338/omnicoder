/**
 * AskUser Tool
 * Pauses agent execution to ask the user a question.
 * The question is yielded as a special event; the orchestrator
 * must collect the user's answer and feed it back.
 */

import type { Tool, ToolContext, ToolEvent } from './types';

export const askUserTool: Tool = {
  name: 'ask_user',
  description: 'Ask the user a question when you need clarification or a decision. The user will see your question and can respond.',
  isReadOnly: true,
  isConcurrencySafe: false,
  inputSchema: {
    type: 'object',
    properties: {
      question: {
        type: 'string',
        description: 'The question to ask the user',
      },
    },
    required: ['question'],
  },

  async *execute(input: Record<string, unknown>, _context: ToolContext): AsyncGenerator<ToolEvent> {
    const question = input.question as string;
    // In the current implementation, the question is returned as the tool result.
    // The ChatPage UI will display it, and the user's next message serves as the answer.
    // Future: implement a dedicated prompt/modal flow.
    yield { type: 'output', content: `🤔 Question for user: ${question}` };
    yield { type: 'complete', result: `[Waiting for user response] ${question}` };
  },
};
