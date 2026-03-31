/**
 * MCP Client
 * Connects to MCP servers via stdio transport
 * Compatible with Claude Code's .mcp.json format
 */

export interface McpServerConfig {
  id: string;
  name: string;
  transport: 'stdio' | 'sse' | 'http';
  command: string;
  args: string[];
  env?: Record<string, string>;
  enabled: boolean;
}

export interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  serverId: string;
}

export interface McpResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
  serverId: string;
}

export interface McpToolResult {
  content: string;
  isError: boolean;
}

/**
 * Manages connections to MCP servers.
 * In MVP, provides a registry interface. Full stdio transport in v1.1.
 */
export class McpManager {
  private servers = new Map<string, McpServerConfig>();
  private tools = new Map<string, McpTool[]>();
  private resources = new Map<string, McpResource[]>();

  /** Register an MCP server configuration */
  addServer(config: McpServerConfig): void {
    this.servers.set(config.id, config);
  }

  /** Remove an MCP server */
  removeServer(id: string): void {
    this.servers.delete(id);
    this.tools.delete(id);
    this.resources.delete(id);
  }

  /** Get all registered servers */
  getServers(): McpServerConfig[] {
    return Array.from(this.servers.values());
  }

  /** Get all tools from all connected servers */
  getAllTools(): McpTool[] {
    const allTools: McpTool[] = [];
    for (const tools of this.tools.values()) {
      allTools.push(...tools);
    }
    return allTools;
  }

  /** Get all resources from all connected servers */
  getAllResources(): McpResource[] {
    const allResources: McpResource[] = [];
    for (const resources of this.resources.values()) {
      allResources.push(...resources);
    }
    return allResources;
  }

  /**
   * Connect to a server and discover its tools/resources.
   * In MVP, this uses Tauri command to spawn the process.
   */
  async connect(serverId: string): Promise<{ success: boolean; error?: string }> {
    const config = this.servers.get(serverId);
    if (!config) return { success: false, error: 'Server not found' };
    if (!config.enabled) return { success: false, error: 'Server is disabled' };

    try {
      const { invoke } = await import('@tauri-apps/api/core');

      // Use Tauri backend to manage the MCP process
      const result = await invoke<{
        tools: Array<{ name: string; description: string; inputSchema: Record<string, unknown> }>;
        resources: Array<{ uri: string; name: string; description?: string; mimeType?: string }>;
      }>('mcp_connect', {
        command: config.command,
        args: config.args,
        env: config.env ?? {},
      });

      this.tools.set(serverId, result.tools.map((t) => ({ ...t, serverId })));
      this.resources.set(serverId, result.resources.map((r) => ({ ...r, serverId })));

      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  }

  /** Call an MCP tool */
  async callTool(serverId: string, toolName: string, input: Record<string, unknown>): Promise<McpToolResult> {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<McpToolResult>('mcp_call_tool', { serverId, toolName, input });
    } catch (err) {
      return { content: `MCP tool error: ${String(err)}`, isError: true };
    }
  }

  /** Read an MCP resource */
  async readResource(serverId: string, uri: string): Promise<string> {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<string>('mcp_read_resource', { serverId, uri });
    } catch (err) {
      return `MCP resource error: ${String(err)}`;
    }
  }
}

// Singleton
export const mcpManager = new McpManager();
