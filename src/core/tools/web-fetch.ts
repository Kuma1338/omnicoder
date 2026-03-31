/**
 * WebFetch Tool
 * Fetch a URL and return its content (HTML stripped to text, or raw)
 */

import type { Tool, ToolContext, ToolEvent } from './types';

export const webFetchTool: Tool = {
  name: 'web_fetch',
  description: 'Fetch the content of a URL. Returns the page text content. Useful for reading documentation, GitHub files, etc.',
  isReadOnly: true,
  isConcurrencySafe: true,
  inputSchema: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'URL to fetch',
      },
      max_length: {
        type: 'number',
        description: 'Maximum number of characters to return (default: 20000)',
      },
    },
    required: ['url'],
  },

  async *execute(input: Record<string, unknown>, _context: ToolContext): AsyncGenerator<ToolEvent> {
    if (!_context.permissions.canAccessNetwork) {
      yield { type: 'complete', result: 'Error: This agent does not have network access permission.' };
      return;
    }

    const url = input.url as string;
    const maxLength = (input.max_length as number) ?? 20000;

    yield { type: 'progress', message: `Fetching ${url}...` };

    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': 'OmniCoder/1.0' },
      });

      if (!response.ok) {
        yield { type: 'complete', result: `HTTP ${response.status}: ${response.statusText}` };
        return;
      }

      const contentType = response.headers.get('content-type') ?? '';
      let text = await response.text();

      // Strip HTML tags for cleaner output
      if (contentType.includes('text/html')) {
        text = text
          .replace(/<script[\s\S]*?<\/script>/gi, '')
          .replace(/<style[\s\S]*?<\/style>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s{2,}/g, ' ')
          .trim();
      }

      if (text.length > maxLength) {
        text = text.substring(0, maxLength) + `\n\n[Truncated at ${maxLength} chars. ${text.length} total.]`;
      }

      yield { type: 'complete', result: text };
    } catch (err) {
      yield { type: 'complete', result: `Error fetching URL: ${String(err)}` };
    }
  },
};
