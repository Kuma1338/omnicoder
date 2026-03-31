/**
 * Multi-Agent Mode
 * Director-Worker orchestration:
 * 1. Director receives user request, plans tasks, assigns to workers
 * 2. Workers execute tasks using tools, report results back
 * 3. Director reviews results, provides final answer to user
 */

import type { IProvider, Message } from '../providers/types';
import type {
  AgentConfig,
  AgentInstance,
  AgentMessage,
  TaskAssignment,
} from './types';
import { MessageRouter } from './message-router';
import { runAgentTurn } from './single-mode';

// ---- Multi-Agent Events (superset of AgentEvent) ----

export type MultiAgentEvent =
  | { type: 'agent_status'; agentId: string; agentName: string; status: AgentInstance['status'] }
  | { type: 'agent_text'; agentId: string; agentName: string; text: string }
  | { type: 'agent_thinking'; agentId: string; agentName: string; thinking: string }
  | { type: 'agent_tool_start'; agentId: string; agentName: string; toolName: string; toolId: string; input: Record<string, unknown> }
  | { type: 'agent_tool_result'; agentId: string; agentName: string; toolName: string; toolId: string; result: string; isError: boolean }
  | { type: 'task_created'; task: TaskAssignment }
  | { type: 'task_updated'; task: TaskAssignment }
  | { type: 'message'; message: AgentMessage }
  | { type: 'done'; summary: string; totalTokens: { input: number; output: number } }
  | { type: 'error'; error: string };

// ---- Director system prompt builder ----

function buildDirectorSystemPrompt(workers: AgentConfig[]): string {
  const workerList = workers
    .map((w) => `- Agent "${w.name}" (ID: ${w.id}, Role: ${w.role}): ${w.allowedTools.length} tools available`)
    .join('\n');

  return `You are the Director agent in a multi-agent coding team. Your role is to:
1. Analyze the user's request and break it down into concrete sub-tasks
2. Assign tasks to the available worker agents based on their roles
3. Review completed work and provide the final response

Available workers:
${workerList}

To assign tasks, output a JSON code block with this format:
\`\`\`json
{
  "tasks": [
    {
      "assignTo": "agent-id",
      "title": "Short task title",
      "description": "Detailed task description with all necessary context"
    }
  ]
}
\`\`\`

After workers complete their tasks, synthesize the results and provide a final response to the user.
If a worker fails, you may reassign the task or adjust the plan.`;
}

function buildWorkerSystemPrompt(config: AgentConfig, task: TaskAssignment): string {
  return `You are ${config.name}, a ${config.role} agent. You have been assigned the following task:

## Task: ${task.title}
${task.description}

Complete this task using your available tools. Be thorough and report your results clearly.
When done, provide a summary of what you accomplished.`;
}

// ---- Task Parser (extract tasks from Director output) ----

interface ParsedTask {
  assignTo: string;
  title: string;
  description: string;
}

function parseDirectorTasks(text: string): ParsedTask[] {
  const jsonMatch = text.match(/```json\s*\n([\s\S]*?)\n```/);
  if (!jsonMatch) return [];

  try {
    const parsed = JSON.parse(jsonMatch[1]);
    if (Array.isArray(parsed.tasks)) {
      return parsed.tasks.filter(
        (t: unknown): t is ParsedTask =>
          typeof t === 'object' && t !== null && 'assignTo' in t && 'title' in t && 'description' in t
      );
    }
  } catch {
    // Not valid JSON
  }
  return [];
}

// ---- Multi-Agent Orchestrator ----

export interface MultiAgentConfig {
  director: AgentConfig & { provider: IProvider };
  workers: Array<AgentConfig & { provider: IProvider }>;
  workingDirectory: string;
  autoApproveTools?: boolean;
  requestApproval?: (action: string, detail: string) => Promise<boolean>;
}

export async function* runMultiAgentTurn(
  userMessage: string,
  config: MultiAgentConfig,
): AsyncGenerator<MultiAgentEvent> {
  const router = new MessageRouter();
  const tasks: TaskAssignment[] = [];
  let totalInput = 0;
  let totalOutput = 0;

  // --- Phase 1: Director plans tasks ---
  yield { type: 'agent_status', agentId: config.director.id, agentName: config.director.name, status: 'thinking' };

  const directorMessages: Message[] = [
    { role: 'user', content: userMessage },
  ];

  let directorFullText = '';
  const directorGen = runAgentTurn(directorMessages, {
    provider: config.director.provider,
    systemPrompt: buildDirectorSystemPrompt(config.workers),
    workingDirectory: config.workingDirectory,
    agentId: config.director.id,
    agentRole: config.director.role,
    autoApproveTools: true, // Director doesn't use tools typically
  });

  for await (const event of directorGen) {
    if (event.type === 'text') {
      directorFullText += event.text;
      yield { type: 'agent_text', agentId: config.director.id, agentName: config.director.name, text: event.text };
    } else if (event.type === 'thinking') {
      yield { type: 'agent_thinking', agentId: config.director.id, agentName: config.director.name, thinking: event.thinking };
    } else if (event.type === 'done') {
      totalInput += event.usage.input_tokens;
      totalOutput += event.usage.output_tokens;
    } else if (event.type === 'error') {
      yield { type: 'error', error: `Director error: ${event.error}` };
      return;
    }
  }

  yield { type: 'agent_status', agentId: config.director.id, agentName: config.director.name, status: 'idle' };

  // --- Phase 2: Parse tasks and assign to workers ---
  const parsedTasks = parseDirectorTasks(directorFullText);

  if (parsedTasks.length === 0) {
    // Director responded directly without tasks — that's the final answer
    yield { type: 'done', summary: directorFullText, totalTokens: { input: totalInput, output: totalOutput } };
    return;
  }

  // Create task assignments
  for (const pt of parsedTasks) {
    const task: TaskAssignment = {
      id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title: pt.title,
      description: pt.description,
      assignedTo: pt.assignTo,
      assignedBy: config.director.id,
      status: 'pending',
      dependencies: [],
      createdAt: Date.now(),
    };
    tasks.push(task);
    yield { type: 'task_created', task };
  }

  // --- Phase 3: Workers execute tasks (sequential for now) ---
  const taskResults: Map<string, string> = new Map();

  for (const task of tasks) {
    const worker = config.workers.find((w) => w.id === task.assignedTo);
    if (!worker) {
      task.status = 'failed';
      task.result = `No worker found with ID: ${task.assignedTo}`;
      yield { type: 'task_updated', task };
      taskResults.set(task.id, task.result);
      continue;
    }

    task.status = 'in_progress';
    yield { type: 'task_updated', task };
    yield { type: 'agent_status', agentId: worker.id, agentName: worker.name, status: 'executing' };

    const workerMessages: Message[] = [
      { role: 'user', content: task.description },
    ];

    let workerText = '';

    const workerGen = runAgentTurn(workerMessages, {
      provider: worker.provider,
      systemPrompt: buildWorkerSystemPrompt(worker, task),
      workingDirectory: config.workingDirectory,
      agentId: worker.id,
      agentRole: worker.role,
      autoApproveTools: config.autoApproveTools,
      requestApproval: config.requestApproval,
    });

    for await (const event of workerGen) {
      if (event.type === 'text') {
        workerText += event.text;
        yield { type: 'agent_text', agentId: worker.id, agentName: worker.name, text: event.text };
      } else if (event.type === 'thinking') {
        yield { type: 'agent_thinking', agentId: worker.id, agentName: worker.name, thinking: event.thinking };
      } else if (event.type === 'tool_start') {
        yield { type: 'agent_tool_start', agentId: worker.id, agentName: worker.name, toolName: event.name, toolId: event.id, input: event.input };
      } else if (event.type === 'tool_result') {
        yield { type: 'agent_tool_result', agentId: worker.id, agentName: worker.name, toolName: event.name, toolId: event.id, result: event.result, isError: event.isError };
      } else if (event.type === 'done') {
        totalInput += event.usage.input_tokens;
        totalOutput += event.usage.output_tokens;
      } else if (event.type === 'error') {
        task.status = 'failed';
        task.result = `Worker error: ${event.error}`;
        task.completedAt = Date.now();
        yield { type: 'task_updated', task };
        yield { type: 'agent_status', agentId: worker.id, agentName: worker.name, status: 'error' };
        continue;
      }
    }

    task.status = 'completed';
    task.result = workerText;
    task.completedAt = Date.now();
    yield { type: 'task_updated', task };
    yield { type: 'agent_status', agentId: worker.id, agentName: worker.name, status: 'idle' };

    // Route completion message to director
    router.send({
      id: `msg-${Date.now()}`,
      from: worker.id,
      to: config.director.id,
      content: `Task "${task.title}" completed.`,
      type: 'result',
      timestamp: Date.now(),
    });

    taskResults.set(task.id, workerText);
  }

  // --- Phase 4: Director reviews results ---
  yield { type: 'agent_status', agentId: config.director.id, agentName: config.director.name, status: 'thinking' };

  const reviewPrompt = tasks
    .map((t) => {
      const worker = config.workers.find((w) => w.id === t.assignedTo);
      return `## Task: ${t.title}\nAssigned to: ${worker?.name ?? t.assignedTo}\nStatus: ${t.status}\nResult:\n${t.result ?? 'No result'}`;
    })
    .join('\n\n---\n\n');

  const reviewMessages: Message[] = [
    { role: 'user', content: userMessage },
    { role: 'assistant', content: directorFullText },
    { role: 'user', content: `All tasks are completed. Here are the results:\n\n${reviewPrompt}\n\nPlease review the results and provide a comprehensive final response to the user.` },
  ];

  let reviewText = '';
  const reviewGen = runAgentTurn(reviewMessages, {
    provider: config.director.provider,
    systemPrompt: buildDirectorSystemPrompt(config.workers),
    workingDirectory: config.workingDirectory,
    agentId: config.director.id,
    agentRole: config.director.role,
    autoApproveTools: true,
  });

  for await (const event of reviewGen) {
    if (event.type === 'text') {
      reviewText += event.text;
      yield { type: 'agent_text', agentId: config.director.id, agentName: config.director.name, text: event.text };
    } else if (event.type === 'done') {
      totalInput += event.usage.input_tokens;
      totalOutput += event.usage.output_tokens;
    }
  }

  yield { type: 'agent_status', agentId: config.director.id, agentName: config.director.name, status: 'idle' };
  yield { type: 'done', summary: reviewText, totalTokens: { input: totalInput, output: totalOutput } };
}
