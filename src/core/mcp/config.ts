/**
 * MCP Configuration Loader
 * Reads .mcp.json (Claude Code compatible format) and project-level configs
 */

import type { McpServerConfig } from './client';

interface McpJsonFormat {
  mcpServers?: Record<string, {
    command: string;
    args?: string[];
    env?: Record<string, string>;
    disabled?: boolean;
  }>;
}

/**
 * Parse .mcp.json content into McpServerConfig array
 */
export function parseMcpJson(content: string): McpServerConfig[] {
  try {
    const parsed: McpJsonFormat = JSON.parse(content);
    if (!parsed.mcpServers) return [];

    return Object.entries(parsed.mcpServers).map(([name, config]) => ({
      id: `mcp-${name}`,
      name,
      transport: 'stdio' as const,
      command: config.command,
      args: config.args ?? [],
      env: config.env,
      enabled: !config.disabled,
    }));
  } catch {
    return [];
  }
}

/**
 * Load MCP config from filesystem
 */
export async function loadMcpConfig(workingDirectory: string): Promise<McpServerConfig[]> {
  const configs: McpServerConfig[] = [];

  try {
    const { readTextFile } = await import('@tauri-apps/plugin-fs');

    // Try project-level .mcp.json
    try {
      const projectConfig = await readTextFile(`${workingDirectory}/.mcp.json`);
      configs.push(...parseMcpJson(projectConfig));
    } catch {
      // No project-level config
    }

    // Try user-level ~/.mcp.json
    try {
      const homeConfig = await readTextFile(`${getHomeDir()}/.mcp.json`);
      const homeServers = parseMcpJson(homeConfig);
      // Avoid duplicates
      for (const server of homeServers) {
        if (!configs.some((c) => c.name === server.name)) {
          configs.push(server);
        }
      }
    } catch {
      // No user-level config
    }
  } catch {
    // plugin-fs not available
  }

  return configs;
}

function getHomeDir(): string {
  // In Tauri webview, use a fixed path; actual path resolved by Tauri API at runtime
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const proc = globalThis as any;
    if (proc.process?.env?.USERPROFILE) return proc.process.env.USERPROFILE;
    if (proc.process?.env?.HOME) return proc.process.env.HOME;
  } catch {
    // no process available
  }
  return 'C:/Users/Default';
}
