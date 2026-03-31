/**
 * SQLite database via @tauri-apps/plugin-sql
 * Handles provider configs, agent templates, sessions, messages
 */

import Database from "@tauri-apps/plugin-sql";
import type { ProviderConfig } from "../providers/types";

let db: Database | null = null;

async function getDb(): Promise<Database> {
  if (!db) {
    db = await Database.load("sqlite:omnicoder.db");
    await migrate(db);
  }
  return db;
}

async function migrate(db: Database): Promise<void> {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS providers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      api_key TEXT,
      base_url TEXT NOT NULL,
      model TEXT NOT NULL,
      proxy_config TEXT,
      custom_headers TEXT,
      max_tokens INTEGER,
      temperature REAL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS agent_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      provider_id TEXT,
      system_prompt TEXT,
      tools TEXT,
      permissions TEXT,
      is_default INTEGER DEFAULT 0
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      name TEXT,
      mode TEXT,
      agents TEXT,
      created_at INTEGER,
      updated_at INTEGER,
      total_tokens INTEGER DEFAULT 0,
      estimated_cost REAL DEFAULT 0
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT,
      agent_id TEXT,
      role TEXT,
      content TEXT,
      tokens_used INTEGER,
      created_at INTEGER
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS mcp_servers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      transport TEXT NOT NULL,
      command TEXT,
      args TEXT,
      env TEXT,
      enabled INTEGER DEFAULT 1
    )
  `);
}

// --- Provider CRUD ---

export interface StoredProvider {
  id: string;
  name: string;
  type: string;
  api_key: string | null;
  base_url: string;
  model: string;
  proxy_config: string | null;
  custom_headers: string | null;
  max_tokens: number | null;
  temperature: number | null;
  created_at: number;
  updated_at: number;
}

export async function getAllProviders(): Promise<StoredProvider[]> {
  const db = await getDb();
  return db.select<StoredProvider[]>("SELECT * FROM providers ORDER BY created_at ASC");
}

export async function saveProvider(config: ProviderConfig & { encryptedApiKey?: string }): Promise<void> {
  const db = await getDb();
  const now = Date.now();
  await db.execute(
    `INSERT OR REPLACE INTO providers
      (id, name, type, api_key, base_url, model, proxy_config, custom_headers, max_tokens, temperature, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT created_at FROM providers WHERE id = ?), ?), ?)`,
    [
      config.id,
      config.name,
      config.type,
      config.encryptedApiKey ?? null,
      config.baseUrl,
      config.model ?? "",
      config.proxy ? JSON.stringify(config.proxy) : null,
      config.customHeaders ? JSON.stringify(config.customHeaders) : null,
      config.maxTokens ?? null,
      config.temperature ?? null,
      config.id,
      now,
      now,
    ]
  );
}

export async function deleteProvider(id: string): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM providers WHERE id = ?", [id]);
}

export function storedToConfig(row: StoredProvider, decryptedKey?: string): ProviderConfig {
  return {
    id: row.id,
    name: row.name,
    type: row.type as ProviderConfig["type"],
    apiKey: decryptedKey,
    baseUrl: row.base_url,
    model: row.model,
    proxy: row.proxy_config ? JSON.parse(row.proxy_config) : undefined,
    customHeaders: row.custom_headers ? JSON.parse(row.custom_headers) : undefined,
    maxTokens: row.max_tokens ?? undefined,
    temperature: row.temperature ?? undefined,
  };
}
