/**
 * OmniCoder Tool System Types
 * Defines the interface for all built-in and MCP tools
 */

// --- Tool Events ---

export interface ToolProgressEvent {
  type: 'progress';
  message: string;
}

export interface ToolOutputEvent {
  type: 'output';
  content: string;
  isError?: boolean;
}

export interface ToolCompleteEvent {
  type: 'complete';
  result: string;
}

export type ToolEvent = ToolProgressEvent | ToolOutputEvent | ToolCompleteEvent;

// --- Tool Context ---

export interface ToolContext {
  workingDirectory: string;
  agentId: string;
  agentRole: string;
  permissions: {
    canEditFiles: boolean;
    canRunBash: boolean;
    canAccessNetwork: boolean;
  };
  /** Callback to request user approval for sensitive operations */
  requestApproval?: (action: string, detail: string) => Promise<boolean>;
}

// --- Tool Interface ---

export interface Tool {
  /** Unique tool name */
  name: string;
  /** Human-readable description */
  description: string;
  /** JSON Schema for tool input */
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
  /** Whether this tool only reads data (no side effects) */
  isReadOnly: boolean;
  /** Whether multiple instances can run concurrently */
  isConcurrencySafe: boolean;
  /** Execute the tool with given input */
  execute(input: Record<string, unknown>, context: ToolContext): AsyncGenerator<ToolEvent>;
}

// --- Tool Registry ---

export interface ToolRegistry {
  register(tool: Tool): void;
  get(name: string): Tool | undefined;
  getAll(): Tool[];
  getByPermission(context: ToolContext): Tool[];
}
