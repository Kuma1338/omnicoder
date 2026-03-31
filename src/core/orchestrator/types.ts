/**
 * OmniCoder Agent Orchestrator Types
 * Multi-agent coordination with role-based permissions
 */

// --- Agent Roles ---

export type AgentRole = 'director' | 'coder' | 'reviewer' | 'tester' | 'researcher' | 'custom';

export interface AgentPermissions {
  canEditFiles: boolean;
  canRunBash: boolean;
  canAccessNetwork: boolean;
  canSpawnSubAgents: boolean;
}

/** Default permissions per role */
export const DEFAULT_PERMISSIONS: Record<AgentRole, AgentPermissions> = {
  director: {
    canEditFiles: false,
    canRunBash: false,
    canAccessNetwork: true,
    canSpawnSubAgents: true,
  },
  coder: {
    canEditFiles: true,
    canRunBash: true,
    canAccessNetwork: true,
    canSpawnSubAgents: false,
  },
  reviewer: {
    canEditFiles: false,
    canRunBash: false,
    canAccessNetwork: true,
    canSpawnSubAgents: false,
  },
  tester: {
    canEditFiles: false,
    canRunBash: true,
    canAccessNetwork: true,
    canSpawnSubAgents: false,
  },
  researcher: {
    canEditFiles: false,
    canRunBash: false,
    canAccessNetwork: true,
    canSpawnSubAgents: false,
  },
  custom: {
    canEditFiles: true,
    canRunBash: true,
    canAccessNetwork: true,
    canSpawnSubAgents: false,
  },
};

// --- Agent Configuration ---

export interface AgentConfig {
  id: string;
  name: string;
  role: AgentRole;
  providerId: string;
  systemPrompt?: string;
  allowedTools: string[];
  permissions: AgentPermissions;
}

export interface AgentInstance extends AgentConfig {
  status: 'idle' | 'thinking' | 'executing' | 'waiting' | 'error';
  currentTask?: TaskAssignment;
  messageHistory: AgentMessage[];
  tokenUsage: { input: number; output: number };
}

// --- Task System ---

export type TaskStatus = 'pending' | 'assigned' | 'in_progress' | 'completed' | 'failed' | 'review';

export interface TaskAssignment {
  id: string;
  title: string;
  description: string;
  assignedTo: string; // agent ID
  assignedBy: string; // agent ID (usually director)
  status: TaskStatus;
  dependencies: string[]; // task IDs that must complete first
  result?: string;
  createdAt: number;
  completedAt?: number;
}

// --- Agent Messages ---

export interface AgentMessage {
  id: string;
  from: string; // agent ID or 'user'
  to: string; // agent ID or 'user' or 'broadcast'
  content: string;
  type: 'task' | 'result' | 'feedback' | 'question' | 'chat';
  timestamp: number;
  metadata?: Record<string, unknown>;
}

// --- Orchestrator Configuration ---

export type WorkflowMode = 'sequential' | 'parallel' | 'director-worker';

export interface OrchestratorConfig {
  mode: 'single' | 'multi';
  agents: AgentConfig[];
  workflow: WorkflowMode;
  autoApproveEdits: boolean;
  maxConcurrentAgents: number;
}

// --- Error Recovery ---

export interface RecoveryStrategy {
  maxRetries: number;
  retryDelayMs: number;
  fallbackProviderId?: string;
  onFinalFailure: 'skip' | 'reassign' | 'abort' | 'ask-user';
}

export const DEFAULT_RECOVERY: RecoveryStrategy = {
  maxRetries: 3,
  retryDelayMs: 2000,
  onFinalFailure: 'ask-user',
};

// --- File Lock (multi-agent conflict prevention) ---

export interface FileLock {
  filePath: string;
  lockedBy: string; // agent ID
  contentHash: string;
  acquiredAt: number;
  expiresAt: number; // auto-release after timeout (prevent deadlock)
}
