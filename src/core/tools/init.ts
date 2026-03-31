/**
 * Tool Initialization
 * Registers all built-in tools to the global registry.
 * Must be called once at app startup before any agent runs.
 */

import { globalToolRegistry } from './registry';
import { bashTool } from './bash';
import { fileReadTool } from './file-read';
import { fileWriteTool } from './file-write';
import { fileEditTool } from './file-edit';
import { globTool } from './glob';
import { grepTool } from './grep';
import { webFetchTool } from './web-fetch';
import { webSearchTool } from './web-search';
import { todoWriteTool } from './todo-write';

let initialized = false;

export function initializeTools(): void {
  if (initialized) return;

  globalToolRegistry.register(bashTool);
  globalToolRegistry.register(fileReadTool);
  globalToolRegistry.register(fileWriteTool);
  globalToolRegistry.register(fileEditTool);
  globalToolRegistry.register(globTool);
  globalToolRegistry.register(grepTool);
  globalToolRegistry.register(webFetchTool);
  globalToolRegistry.register(webSearchTool);
  globalToolRegistry.register(todoWriteTool);

  initialized = true;
}
