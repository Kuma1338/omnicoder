/**
 * Tool Registry
 * Central registry for all built-in and MCP tools
 */

import type { Tool, ToolContext, ToolRegistry as IToolRegistry } from './types';

export class ToolRegistry implements IToolRegistry {
  private tools = new Map<string, Tool>();

  register(tool: Tool): void {
    this.tools.set(tool.name, tool);
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  getAll(): Tool[] {
    return Array.from(this.tools.values());
  }

  getByPermission(context: ToolContext): Tool[] {
    return this.getAll().filter((tool) => {
      // Read-only tools are always available
      if (tool.isReadOnly) return true;
      // File write tools need canEditFiles
      if (tool.name.startsWith('file_write') || tool.name.startsWith('file_edit')) {
        return context.permissions.canEditFiles;
      }
      // Bash needs canRunBash
      if (tool.name === 'bash') return context.permissions.canRunBash;
      // Network tools
      if (tool.name === 'web_search' || tool.name === 'web_fetch') {
        return context.permissions.canAccessNetwork;
      }
      return true;
    });
  }
}

// Singleton registry
export const globalToolRegistry = new ToolRegistry();
