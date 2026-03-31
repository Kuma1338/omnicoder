/**
 * WebSearch Tool
 * Search the web using a search engine API
 * Supports DuckDuckGo (no API key needed) and custom search APIs
 */

import type { Tool, ToolContext, ToolEvent } from './types';

export const webSearchTool: Tool = {
  name: 'web_search',
  description: 'Search the web for information. Returns a list of relevant results with titles, URLs, and snippets.',
  isReadOnly: true,
  isConcurrencySafe: true,
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search query',
      },
      max_results: {
        type: 'number',
        description: 'Maximum number of results (default: 5)',
      },
    },
    required: ['query'],
  },

  async *execute(input: Record<string, unknown>, context: ToolContext): AsyncGenerator<ToolEvent> {
    if (!context.permissions.canAccessNetwork) {
      yield { type: 'complete', result: 'Error: This agent does not have network access permission.' };
      return;
    }

    const query = input.query as string;
    const maxResults = (input.max_results as number) ?? 5;

    yield { type: 'progress', message: `Searching: ${query}` };

    try {
      // Use DuckDuckGo HTML search (no API key needed)
      const encodedQuery = encodeURIComponent(query);
      const response = await fetch(`https://html.duckduckgo.com/html/?q=${encodedQuery}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/html',
        },
      });

      if (!response.ok) {
        yield { type: 'complete', result: `Search failed: HTTP ${response.status}` };
        return;
      }

      const html = await response.text();

      // Parse results from DDG HTML
      const results: Array<{ title: string; url: string; snippet: string }> = [];
      const resultRegex = /<a class="result__a"[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>[\s\S]*?<a class="result__snippet"[^>]*>([^<]*)<\/a>/g;

      let match;
      while ((match = resultRegex.exec(html)) !== null && results.length < maxResults) {
        results.push({
          url: match[1].replace(/^\/\/duckduckgo\.com\/l\/\?uddg=/, '').split('&rut=')[0],
          title: match[2].trim(),
          snippet: match[3].replace(/<[^>]+>/g, '').trim(),
        });
      }

      if (results.length === 0) {
        yield { type: 'complete', result: 'No results found.' };
        return;
      }

      const formatted = results
        .map((r, i) => `${i + 1}. **${r.title}**\n   URL: ${decodeURIComponent(r.url)}\n   ${r.snippet}`)
        .join('\n\n');

      yield { type: 'complete', result: formatted };
    } catch (err) {
      yield { type: 'complete', result: `Search error: ${String(err)}` };
    }
  },
};
