/**
 * Message Router
 * Routes messages between agents in multi-agent mode.
 * Agents communicate through a central bus — the Director sees all,
 * workers only see messages addressed to them.
 */

import type { AgentMessage } from './types';

export type MessageHandler = (message: AgentMessage) => void;

export class MessageRouter {
  private handlers = new Map<string, MessageHandler>();
  private log: AgentMessage[] = [];

  /** Register an agent to receive messages */
  registerAgent(agentId: string, handler: MessageHandler): void {
    this.handlers.set(agentId, handler);
  }

  /** Unregister an agent */
  unregisterAgent(agentId: string): void {
    this.handlers.delete(agentId);
  }

  /** Send a message from one agent to another (or broadcast) */
  send(message: AgentMessage): void {
    this.log.push(message);

    if (message.to === 'broadcast') {
      for (const [id, handler] of this.handlers) {
        if (id !== message.from) handler(message);
      }
    } else {
      const handler = this.handlers.get(message.to);
      handler?.(message);
    }
  }

  /** Get all messages (for Director context) */
  getFullLog(): AgentMessage[] {
    return [...this.log];
  }

  /** Get messages relevant to a specific agent */
  getMessagesFor(agentId: string): AgentMessage[] {
    return this.log.filter(
      (m) => m.to === agentId || m.to === 'broadcast' || m.from === agentId
    );
  }

  /** Clear message log */
  clear(): void {
    this.log = [];
  }
}
