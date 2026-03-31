import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Square, RotateCcw, ChevronDown, Bot, User, Wrench, Brain, AlertCircle } from "lucide-react";
import { ProviderRegistry } from "../../core/providers/registry";
import { getAllProviders, storedToConfig } from "../../core/config/database";
import { runAgentTurn } from "../../core/orchestrator/single-mode";
import { runMultiAgentTurn } from "../../core/orchestrator/multi-mode";
import type { ProviderConfig } from "../../core/providers/types";
import type { Message } from "../../core/providers/types";
import { invoke } from "@tauri-apps/api/core";
import { homeDir, desktopDir } from "@tauri-apps/api/path";
import { trackUsage } from "./StatsPage";
import { createSession, saveMessage, updateSessionTokens } from "../../core/config/sessions";

// ---- Types ----

type MessageType =
  | { role: "user"; content: string }
  | { role: "assistant"; parts: AssistantPart[] }
  | { role: "system"; content: string };

type AssistantPart =
  | { type: "text"; text: string }
  | { type: "thinking"; thinking: string }
  | { type: "tool_start"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; id: string; name: string; result: string; isError: boolean };

// ---- Provider Selector ----

function ProviderSelector({
  providers,
  selected,
  onSelect,
}: {
  providers: ProviderConfig[];
  selected: ProviderConfig | null;
  onSelect: (p: ProviderConfig) => void;
}) {
  const [open, setOpen] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  if (providers.length === 0) {
    return (
      <span className="text-xs px-3 py-1.5 rounded-md" style={{ color: "var(--text-muted)", background: "var(--bg-card)", border: "1px solid var(--border)" }}>
        未配置 Provider — 请先在 Settings 中添加
      </span>
    );
  }

  return (
    <div className="relative" ref={dropRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm"
        style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
      >
        <Bot size={14} style={{ color: "var(--accent)" }} />
        {selected?.name ?? "选择 Provider"}
        <ChevronDown size={12} />
      </button>
      {open && (
        <div
          className="absolute left-0 mt-1 rounded-lg shadow-xl z-50 overflow-hidden min-w-48"
          style={{ top: "100%", background: "var(--bg-card)", border: "1px solid var(--border)" }}
        >
          {providers.map((p) => (
            <button
              key={p.id}
              onClick={() => { onSelect(p); setOpen(false); }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-[var(--bg-hover)] transition-colors"
              style={{ color: selected?.id === p.id ? "var(--accent)" : "var(--text-primary)" }}
            >
              <div>{p.name}</div>
              <div className="text-xs" style={{ color: "var(--text-muted)" }}>{p.model}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---- Message Rendering ----

function ToolBlock({ part }: { part: Extract<AssistantPart, { type: "tool_start" | "tool_result" }> }) {
  const [expanded, setExpanded] = useState(false);

  if (part.type === "tool_start") {
    return (
      <div
        className="rounded-md px-3 py-2 text-xs my-1"
        style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}
      >
        <div className="flex items-center gap-2 cursor-pointer" onClick={() => setExpanded((v) => !v)}>
          <Wrench size={12} style={{ color: "var(--warning)" }} />
          <span style={{ color: "var(--warning)" }} className="font-mono">{part.name}</span>
          <ChevronDown size={10} style={{ color: "var(--text-muted)", transform: expanded ? "rotate(180deg)" : undefined }} />
        </div>
        {expanded && (
          <pre className="mt-2 text-xs overflow-x-auto" style={{ color: "var(--text-secondary)" }}>
            {JSON.stringify(part.input, null, 2)}
          </pre>
        )}
      </div>
    );
  }

  return (
    <div
      className="rounded-md px-3 py-2 text-xs my-1"
      style={{
        background: part.isError ? "rgba(248,81,73,0.1)" : "rgba(63,185,80,0.08)",
        border: `1px solid ${part.isError ? "var(--error)" : "rgba(63,185,80,0.3)"}`,
      }}
    >
      <div className="flex items-center gap-2 cursor-pointer" onClick={() => setExpanded((v) => !v)}>
        {part.isError ? (
          <AlertCircle size={12} style={{ color: "var(--error)" }} />
        ) : (
          <Wrench size={12} style={{ color: "var(--success)" }} />
        )}
        <span style={{ color: part.isError ? "var(--error)" : "var(--success)" }} className="font-mono">
          {part.name} → {part.isError ? "error" : "ok"}
        </span>
        <ChevronDown size={10} style={{ color: "var(--text-muted)", transform: expanded ? "rotate(180deg)" : undefined }} />
      </div>
      {expanded && (
        <pre className="mt-2 text-xs overflow-x-auto whitespace-pre-wrap" style={{ color: "var(--text-secondary)" }}>
          {part.result}
        </pre>
      )}
    </div>
  );
}

function MessageBubble({ msg }: { msg: MessageType }) {
  if (msg.role === "system") {
    return (
      <div className="text-xs text-center py-1" style={{ color: "var(--text-muted)" }}>
        {msg.content}
      </div>
    );
  }

  if (msg.role === "user") {
    return (
      <div className="flex gap-3 justify-end">
        <div
          className="max-w-[80%] rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm"
          style={{ background: "var(--accent)", color: "#fff" }}
        >
          {msg.content}
        </div>
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5"
          style={{ background: "var(--bg-hover)" }}
        >
          <User size={14} style={{ color: "var(--text-secondary)" }} />
        </div>
      </div>
    );
  }

  // Assistant
  return (
    <div className="flex gap-3">
      <div
        className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5"
        style={{ background: "var(--accent)", opacity: 0.8 }}
      >
        <Bot size={14} color="#fff" />
      </div>
      <div className="flex-1 min-w-0">
        {msg.parts.map((part, i) => {
          if (part.type === "text") {
            return (
              <p key={i} className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: "var(--text-primary)" }}>
                {part.text}
              </p>
            );
          }
          if (part.type === "thinking") {
            return (
              <details key={i} className="text-xs my-1">
                <summary className="cursor-pointer" style={{ color: "var(--text-muted)" }}>
                  <Brain size={10} className="inline mr-1" />
                  思考过程
                </summary>
                <pre className="mt-1 pl-3 text-xs whitespace-pre-wrap" style={{ color: "var(--text-muted)", borderLeft: "2px solid var(--border)" }}>
                  {part.thinking}
                </pre>
              </details>
            );
          }
          if (part.type === "tool_start" || part.type === "tool_result") {
            return <ToolBlock key={i} part={part} />;
          }
          return null;
        })}
      </div>
    </div>
  );
}

// ---- Main ChatPage ----

export default function ChatPage() {
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<ProviderConfig | null>(null);
  const [messages, setMessages] = useState<MessageType[]>([]);
  const [input, setInput] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  const [sessionId] = useState(() => `session-${Date.now()}`);
  const [sessionCreated, setSessionCreated] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [workingDir, setWorkingDir] = useState("C:/");
  const [mode] = useState<"single" | "multi">(() => {
    const stored = localStorage.getItem("omnicoder_mode");
    return stored === "multi" ? "multi" : "single";
  });

  // History for provider calls (Anthropic-format)
  const historyRef = useRef<Message[]>([]);

  useEffect(() => {
    loadProviders();
    // Resolve working directory from OS
    desktopDir().then(setWorkingDir).catch(() => {
      homeDir().then(setWorkingDir).catch(() => {});
    });
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function loadProviders() {
    try {
      const rows = await getAllProviders();
      const configs: ProviderConfig[] = [];
      for (const row of rows) {
        let key: string | undefined;
        if (row.api_key) {
          try { key = await invoke<string>("decrypt_secret", { ciphertext: row.api_key }); }
          catch { key = row.api_key; }
        }
        configs.push(storedToConfig(row, key));
      }
      setProviders(configs);
      if (configs.length > 0) setSelectedProvider(configs[0]);
    } catch (e) {
      console.error(e);
    }
  }

  function appendToLast(updater: (parts: AssistantPart[]) => AssistantPart[]) {
    setMessages((msgs) => {
      const last = msgs[msgs.length - 1];
      if (!last || last.role !== "assistant") return msgs;
      return [...msgs.slice(0, -1), { role: "assistant", parts: updater(last.parts) }];
    });
  }

  const handleSend = useCallback(async () => {
    if (!input.trim() || isRunning || !selectedProvider) return;

    const userText = input.trim();
    setInput("");
    setIsRunning(true);

    // Create session on first message
    if (!sessionCreated) {
      try {
        await createSession(sessionId, userText.slice(0, 50), "single");
        setSessionCreated(true);
      } catch { /* DB not ready yet, continue anyway */ }
    }

    // Add user message to UI
    setMessages((m) => [...m, { role: "user", content: userText }]);
    // Add assistant placeholder
    setMessages((m) => [...m, { role: "assistant", parts: [] }]);

    // Save user message to DB
    saveMessage(sessionId, "main", "user", userText).catch(() => {});

    // Update history
    historyRef.current = [...historyRef.current, { role: "user", content: userText }];

    const registry = new ProviderRegistry();
    const provider = registry.register(selectedProvider);

    const ac = new AbortController();
    setAbortController(ac);

    try {
      // Choose single or multi-agent mode
      const teamConfigRaw = localStorage.getItem("omnicoder_team");
      const isMulti = mode === "multi" && teamConfigRaw;

      let gen: AsyncGenerator<any>;
      if (isMulti) {
        // Multi-Agent: parse team config, build providers for each agent
        const teamConfig = JSON.parse(teamConfigRaw!) as Array<{ id: string; name: string; role: string; providerId: string; systemPrompt: string; provider?: ProviderConfig }>;
        const director = teamConfig.find((a) => a.role === "director");
        const workers = teamConfig.filter((a) => a.role !== "director");

        if (director?.provider && workers.length > 0) {
          const directorProvider = registry.register({ ...director.provider, id: `dir-${Date.now()}` });
          const workerAgents = workers.map((w, i) => {
            const wp = w.provider ? registry.register({ ...w.provider, id: `worker-${i}-${Date.now()}` }) : provider;
            return { id: w.id, name: w.name, role: w.role as any, providerId: w.providerId, allowedTools: [] as string[], permissions: { canEditFiles: w.role === 'coder', canRunBash: w.role === 'coder' || w.role === 'tester', canAccessNetwork: true, canSpawnSubAgents: false }, provider: wp };
          });

          gen = runMultiAgentTurn(userText, {
            director: { ...director, id: director.id, name: director.name, role: 'director' as any, providerId: director.providerId, allowedTools: [], permissions: { canEditFiles: false, canRunBash: false, canAccessNetwork: true, canSpawnSubAgents: true }, provider: directorProvider },
            workers: workerAgents,
            workingDirectory: workingDir,
            autoApproveTools: true,
          });
        } else {
          // Fallback to single agent if team incomplete
          gen = runAgentTurn(historyRef.current, { provider, workingDirectory: workingDir, agentId: "main", agentRole: "coder", autoApproveTools: true });
        }
      } else {
        gen = runAgentTurn(historyRef.current, {
          provider,
          workingDirectory: workingDir,
          agentId: "main",
          agentRole: "coder",
          autoApproveTools: true,
        });
      }

      const newAssistantParts: AssistantPart[] = [];

      for await (const event of gen) {
        if (ac.signal.aborted) break;

        // Handle both single-agent events (text/thinking/tool_*) and multi-agent events (agent_text/agent_tool_*)
        const eventText = event.type === "text" ? event.text : event.type === "agent_text" ? `**[${event.agentName}]** ${event.text}` : null;
        const eventThinking = event.type === "thinking" ? event.thinking : event.type === "agent_thinking" ? event.thinking : null;

        if (eventText !== null) {
          const lastPart = newAssistantParts[newAssistantParts.length - 1];
          if (lastPart?.type === "text") {
            lastPart.text += eventText;
          } else {
            newAssistantParts.push({ type: "text", text: eventText });
          }
          appendToLast(() => [...newAssistantParts]);
        } else if (eventThinking !== null) {
          newAssistantParts.push({ type: "thinking", thinking: eventThinking });
          appendToLast(() => [...newAssistantParts]);
        } else if (event.type === "tool_start" || event.type === "agent_tool_start") {
          const name = event.type === "tool_start" ? event.name : event.toolName;
          const id = event.type === "tool_start" ? event.id : event.toolId;
          newAssistantParts.push({ type: "tool_start", id, name, input: event.input });
          appendToLast(() => [...newAssistantParts]);
        } else if (event.type === "tool_result" || event.type === "agent_tool_result") {
          const name = event.type === "tool_result" ? event.name : event.toolName;
          const id = event.type === "tool_result" ? event.id : event.toolId;
          const result = event.result;
          const isError = event.isError;
          newAssistantParts.push({ type: "tool_result", id, name, result, isError });
          appendToLast(() => [...newAssistantParts]);
        } else if (event.type === "done") {
          // Track token usage for stats (handle both single and multi-agent event shapes)
          const usage = event.usage ?? event.totalTokens ?? { input_tokens: 0, output_tokens: 0 };
          const inputTok = usage.input_tokens ?? usage.input ?? 0;
          const outputTok = usage.output_tokens ?? usage.output ?? 0;
          trackUsage(inputTok, outputTok);
          // Save assistant response to DB
          const assistantText = newAssistantParts
            .filter((p) => p.type === "text")
            .map((p) => (p as { type: "text"; text: string }).text)
            .join("");
          saveMessage(sessionId, "main", "assistant", assistantText, event.usage.output_tokens).catch(() => {});
          updateSessionTokens(sessionId, event.usage.input_tokens, event.usage.output_tokens, (event.usage.input_tokens * 3 + event.usage.output_tokens * 15) / 1_000_000).catch(() => {});
          // Preserve full message history (including tool_use/tool_result blocks) for multi-turn
          if (event.messages) {
            historyRef.current = event.messages;
          }
        } else if (event.type === "error") {
          setMessages((m) => [...m, { role: "system", content: `Error: ${event.error}` }]);
        }
      }
    } catch (err) {
      setMessages((m) => [...m, { role: "system", content: `Error: ${String(err)}` }]);
    } finally {
      setIsRunning(false);
      setAbortController(null);
    }
  }, [input, isRunning, selectedProvider, workingDir, sessionId, sessionCreated]);

  function handleStop() {
    abortController?.abort();
    setIsRunning(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div
        className="flex items-center gap-3 px-4 py-2.5 shrink-0"
        style={{ borderBottom: "1px solid var(--border)", background: "var(--bg-secondary)" }}
      >
        <ProviderSelector providers={providers} selected={selectedProvider} onSelect={setSelectedProvider} />
        {mode === "multi" && (
          <span className="text-xs px-2 py-1 rounded-full" style={{ background: "rgba(88,166,255,0.15)", color: "var(--accent)" }}>
            多 Agent 模式
          </span>
        )}
        <div className="flex-1" />
        <button
          className="p-1.5 rounded hover:bg-[var(--bg-hover)]"
          title="清除对话"
          onClick={() => { setMessages([]); historyRef.current = []; }}
          style={{ color: "var(--text-muted)" }}
        >
          <RotateCcw size={14} />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4 flex flex-col gap-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center flex-1 gap-3" style={{ color: "var(--text-muted)" }}>
            <Bot size={48} className="opacity-20" />
            <p className="text-sm">选择一个 Provider，开始编码对话</p>
          </div>
        ) : (
          messages.map((msg, i) => <MessageBubble key={i} msg={msg} />)
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div
        className="shrink-0 px-4 pb-4 pt-3"
        style={{ borderTop: "1px solid var(--border)" }}
      >
        <div
          className="flex gap-2 items-end rounded-xl px-4 py-3"
          style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
        >
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入消息，Shift+Enter 换行，Enter 发送"
            rows={1}
            className="flex-1 resize-none text-sm outline-none bg-transparent"
            style={{
              color: "var(--text-primary)",
              maxHeight: 200,
              lineHeight: "1.5",
            }}
          />
          {isRunning ? (
            <button
              onClick={handleStop}
              className="p-2 rounded-lg transition-colors"
              style={{ background: "var(--error)", color: "#fff" }}
              title="停止"
            >
              <Square size={14} />
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!input.trim() || !selectedProvider}
              className="p-2 rounded-lg transition-colors disabled:opacity-40"
              style={{ background: "var(--accent)", color: "#fff" }}
              title="发送"
            >
              <Send size={14} />
            </button>
          )}
        </div>
        <p className="text-xs mt-1.5 text-center" style={{ color: "var(--text-muted)" }}>
          Enter 发送 · Shift+Enter 换行
        </p>
      </div>
    </div>
  );
}
