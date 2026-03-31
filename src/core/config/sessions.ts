/**
 * Session persistence — save/load chat sessions to SQLite
 */

import Database from "@tauri-apps/plugin-sql";

let db: Database | null = null;

async function getDb(): Promise<Database> {
  if (!db) {
    db = await Database.load("sqlite:omnicoder.db");
  }
  return db;
}

export interface StoredSession {
  id: string;
  name: string | null;
  mode: string | null;
  agents: string | null;
  created_at: number;
  updated_at: number;
  total_tokens: number;
  estimated_cost: number;
}

export interface StoredMessage {
  id: number;
  session_id: string;
  agent_id: string | null;
  role: string;
  content: string;
  tokens_used: number | null;
  created_at: number;
}

// --- Sessions ---

export async function createSession(id: string, name: string, mode: string): Promise<void> {
  const db = await getDb();
  const now = Date.now();
  await db.execute(
    "INSERT INTO sessions (id, name, mode, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    [id, name, mode, now, now]
  );
}

export async function getAllSessions(): Promise<StoredSession[]> {
  const db = await getDb();
  return db.select<StoredSession[]>("SELECT * FROM sessions ORDER BY updated_at DESC");
}

export async function updateSessionTokens(
  sessionId: string,
  inputTokens: number,
  outputTokens: number,
  cost: number,
): Promise<void> {
  const db = await getDb();
  await db.execute(
    `UPDATE sessions SET
      total_tokens = total_tokens + ?,
      estimated_cost = estimated_cost + ?,
      updated_at = ?
     WHERE id = ?`,
    [inputTokens + outputTokens, cost, Date.now(), sessionId]
  );
}

export async function deleteSession(id: string): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM messages WHERE session_id = ?", [id]);
  await db.execute("DELETE FROM sessions WHERE id = ?", [id]);
}

// --- Messages ---

export async function saveMessage(
  sessionId: string,
  agentId: string | null,
  role: string,
  content: string,
  tokensUsed?: number,
): Promise<void> {
  const db = await getDb();
  await db.execute(
    "INSERT INTO messages (session_id, agent_id, role, content, tokens_used, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    [sessionId, agentId, role, content, tokensUsed ?? null, Date.now()]
  );
}

export async function getSessionMessages(sessionId: string): Promise<StoredMessage[]> {
  const db = await getDb();
  return db.select<StoredMessage[]>(
    "SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC",
    [sessionId]
  );
}
