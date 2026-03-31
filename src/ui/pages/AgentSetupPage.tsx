import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Trash2, Play, Users, Crown, Code, Eye, TestTube, Search, Cog } from "lucide-react";
import { getAllProviders, storedToConfig } from "../../core/config/database";
import { invoke } from "@tauri-apps/api/core";
import type { ProviderConfig } from "../../core/providers/types";
import type { AgentRole } from "../../core/orchestrator/types";
import { DEFAULT_PERMISSIONS } from "../../core/orchestrator/types";

// ---- Types ----

interface AgentDraft {
  id: string;
  name: string;
  role: AgentRole;
  providerId: string;
  systemPrompt: string;
}

const ROLES: Array<{ value: AgentRole; label: string; icon: typeof Crown; color: string; desc: string }> = [
  { value: "director", label: "Director", icon: Crown, color: "var(--warning)", desc: "规划任务、分配工作、审查结果" },
  { value: "coder", label: "Coder", icon: Code, color: "var(--accent)", desc: "编写代码、编辑文件、执行命令" },
  { value: "reviewer", label: "Reviewer", icon: Eye, color: "var(--success)", desc: "审查代码、检查质量（只读）" },
  { value: "tester", label: "Tester", icon: TestTube, color: "#c084fc", desc: "运行测试、验证功能" },
  { value: "researcher", label: "Researcher", icon: Search, color: "#f472b6", desc: "搜索资料、阅读文档（只读）" },
  { value: "custom", label: "Custom", icon: Cog, color: "var(--text-secondary)", desc: "自定义权限" },
];

function roleInfo(role: AgentRole) {
  return ROLES.find((r) => r.value === role) ?? ROLES[5];
}

// ---- Agent Card ----

function AgentCard({
  agent,
  providers,
  onChange,
  onDelete,
}: {
  agent: AgentDraft;
  providers: ProviderConfig[];
  onChange: (updated: AgentDraft) => void;
  onDelete: () => void;
}) {
  const ri = roleInfo(agent.role);
  const Icon = ri.icon;
  const perms = DEFAULT_PERMISSIONS[agent.role];

  return (
    <div
      className="rounded-lg overflow-hidden flex flex-col"
      style={{ border: "1px solid var(--border)", background: "var(--bg-card)", minWidth: 280 }}
    >
      {/* Role header */}
      <div className="px-4 py-3 flex items-center gap-3" style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="p-1.5 rounded" style={{ background: `${ri.color}20` }}>
          <Icon size={16} style={{ color: ri.color }} />
        </div>
        <div className="flex-1 min-w-0">
          <input
            value={agent.name}
            onChange={(e) => onChange({ ...agent, name: e.target.value })}
            className="bg-transparent text-sm font-medium outline-none w-full"
            style={{ color: "var(--text-primary)" }}
            placeholder="Agent 名称"
          />
        </div>
        <button
          onClick={onDelete}
          className="p-1 rounded hover:bg-red-500/20"
          title="删除"
        >
          <Trash2 size={12} style={{ color: "var(--error)" }} />
        </button>
      </div>

      <div className="px-4 py-3 flex flex-col gap-3">
        {/* Role select */}
        <div className="flex flex-col gap-1">
          <label className="text-xs" style={{ color: "var(--text-secondary)" }}>角色</label>
          <select
            value={agent.role}
            onChange={(e) => onChange({ ...agent, role: e.target.value as AgentRole })}
            className="rounded-md px-2 py-1.5 text-sm"
            style={{ background: "var(--bg-primary)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
          >
            {ROLES.map((r) => (
              <option key={r.value} value={r.value}>{r.label} — {r.desc}</option>
            ))}
          </select>
        </div>

        {/* Provider select */}
        <div className="flex flex-col gap-1">
          <label className="text-xs" style={{ color: "var(--text-secondary)" }}>AI Provider</label>
          <select
            value={agent.providerId}
            onChange={(e) => onChange({ ...agent, providerId: e.target.value })}
            className="rounded-md px-2 py-1.5 text-sm"
            style={{ background: "var(--bg-primary)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
          >
            <option value="">选择 Provider...</option>
            {providers.map((p) => (
              <option key={p.id} value={p.id}>{p.name} ({p.model})</option>
            ))}
          </select>
        </div>

        {/* System prompt */}
        <div className="flex flex-col gap-1">
          <label className="text-xs" style={{ color: "var(--text-secondary)" }}>System Prompt（可选）</label>
          <textarea
            value={agent.systemPrompt}
            onChange={(e) => onChange({ ...agent, systemPrompt: e.target.value })}
            placeholder="自定义指令..."
            rows={3}
            className="rounded-md px-2 py-1.5 text-xs outline-none resize-none"
            style={{ background: "var(--bg-primary)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
          />
        </div>

        {/* Permission badges */}
        <div className="flex flex-wrap gap-1.5">
          {perms.canEditFiles && (
            <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "var(--accent)", color: "#fff", opacity: 0.8 }}>文件编辑</span>
          )}
          {perms.canRunBash && (
            <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "var(--warning)", color: "#000", opacity: 0.8 }}>Shell 执行</span>
          )}
          {perms.canAccessNetwork && (
            <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "var(--success)", color: "#fff", opacity: 0.8 }}>网络访问</span>
          )}
          {perms.canSpawnSubAgents && (
            <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "#c084fc", color: "#fff", opacity: 0.8 }}>子 Agent</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ---- Main Page ----

export default function AgentSetupPage() {
  const navigate = useNavigate();
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [agents, setAgents] = useState<AgentDraft[]>([
    { id: "director-1", name: "Director", role: "director", providerId: "", systemPrompt: "" },
    { id: "coder-1", name: "Coder", role: "coder", providerId: "", systemPrompt: "" },
  ]);

  useEffect(() => {
    loadProviders();
  }, []);

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
    } catch (e) {
      console.error(e);
    }
  }

  function addAgent() {
    const id = `agent-${Date.now()}`;
    setAgents((a) => [...a, { id, name: "New Agent", role: "coder", providerId: "", systemPrompt: "" }]);
  }

  function updateAgent(id: string, updated: AgentDraft) {
    setAgents((a) => a.map((ag) => (ag.id === id ? updated : ag)));
  }

  function removeAgent(id: string) {
    setAgents((a) => a.filter((ag) => ag.id !== id));
  }

  const hasDirector = agents.some((a) => a.role === "director");
  const allHaveProvider = agents.every((a) => a.providerId);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center justify-between px-6 py-4 shrink-0"
        style={{ borderBottom: "1px solid var(--border)", background: "var(--bg-secondary)" }}
      >
        <div>
          <h1 className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>
            多 Agent 配置
          </h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
            配置 Agent 团队：指定角色、分配 AI Provider、设置权限
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={addAgent}
            className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium"
            style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
          >
            <Plus size={14} />
            添加 Agent
          </button>
          <button
            disabled={!hasDirector || !allHaveProvider || agents.length < 2}
            className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors disabled:opacity-40"
            style={{ background: "var(--accent)", color: "#fff" }}
            title={!hasDirector ? "需要至少一个 Director" : !allHaveProvider ? "所有 Agent 需要选择 Provider" : ""}
            onClick={() => {
              // Save agent team config and navigate to chat in multi-agent mode
              const teamConfig = agents.map((a) => ({
                ...a,
                provider: providers.find((p) => p.id === a.providerId),
              }));
              localStorage.setItem("omnicoder_team", JSON.stringify(teamConfig));
              localStorage.setItem("omnicoder_mode", "multi");
              navigate("/chat");
            }}
          >
            <Play size={14} />
            启动团队
          </button>
        </div>
      </div>

      {/* Agent grid */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {providers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3" style={{ color: "var(--text-muted)" }}>
            <Users size={48} className="opacity-20" />
            <p className="text-sm">请先在 Settings 中配置至少一个 AI 服务商</p>
          </div>
        ) : (
          <>
            {/* Workflow diagram */}
            <div
              className="mb-4 p-3 rounded-lg text-xs text-center"
              style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)", color: "var(--text-muted)" }}
            >
              用户输入 → <span style={{ color: "var(--warning)" }}>Director 分析/拆任务</span> →{" "}
              <span style={{ color: "var(--accent)" }}>Workers 并行执行</span> →{" "}
              <span style={{ color: "var(--success)" }}>Reviewer 审查</span> → 最终交付
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {agents.map((agent) => (
                <AgentCard
                  key={agent.id}
                  agent={agent}
                  providers={providers}
                  onChange={(updated) => updateAgent(agent.id, updated)}
                  onDelete={() => removeAgent(agent.id)}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
