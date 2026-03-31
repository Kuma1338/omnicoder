import { useState, useEffect, useRef } from "react";
import { Plus, Trash2, CheckCircle, XCircle, Loader2, ChevronDown, ChevronUp, Copy, Download, Upload } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { BUILT_IN_PRESETS } from "../../core/providers/registry";
import { ProviderRegistry } from "../../core/providers/registry";
import type { ProviderConfig, ProviderPreset } from "../../core/providers/types";
import { getAllProviders, saveProvider, deleteProvider, storedToConfig } from "../../core/config/database";

// ---- Types ----

interface ProviderFormState {
  id: string;
  name: string;
  type: ProviderConfig["type"];
  apiKey: string;
  baseUrl: string;
  model: string;
  maxTokens: string;
  temperature: string;
  proxyEnabled: boolean;
  proxyProtocol: "http" | "https" | "socks5";
  proxyHost: string;
  proxyPort: string;
  proxyUser: string;
  proxyPass: string;
  customHeadersRaw: string;
}

type ConnectionStatus = "idle" | "testing" | "success" | "error";

const PROVIDER_TYPES: ProviderConfig["type"][] = ["anthropic", "openai", "gemini", "ollama", "custom"];


function formToConfig(form: ProviderFormState): ProviderConfig {
  return {
    id: form.id,
    name: form.name,
    type: form.type,
    apiKey: form.apiKey || undefined,
    baseUrl: form.baseUrl,
    model: form.model,
    maxTokens: form.maxTokens ? parseInt(form.maxTokens) : undefined,
    temperature: form.temperature ? parseFloat(form.temperature) : undefined,
    proxy: form.proxyEnabled
      ? {
          protocol: form.proxyProtocol,
          host: form.proxyHost,
          port: parseInt(form.proxyPort) || 7890,
          auth:
            form.proxyUser
              ? { username: form.proxyUser, password: form.proxyPass }
              : undefined,
        }
      : undefined,
    customHeaders: form.customHeadersRaw
      ? (() => {
          try {
            return JSON.parse(form.customHeadersRaw);
          } catch {
            return undefined;
          }
        })()
      : undefined,
  };
}

// ---- Sub-components ----

function StatusBadge({ status, error }: { status: ConnectionStatus; error?: string }) {
  if (status === "idle") return null;
  if (status === "testing")
    return (
      <span className="flex items-center gap-1 text-xs" style={{ color: "var(--text-secondary)" }}>
        <Loader2 size={12} className="animate-spin" /> 测试中...
      </span>
    );
  if (status === "success")
    return (
      <span className="flex items-center gap-1 text-xs" style={{ color: "var(--success)" }}>
        <CheckCircle size={12} /> 连接成功
      </span>
    );
  return (
    <span className="flex items-center gap-1 text-xs" style={{ color: "var(--error)" }} title={error}>
      <XCircle size={12} /> 连接失败
    </span>
  );
}

function InputField({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  mono = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="rounded-md px-3 py-1.5 text-sm outline-none focus:ring-1"
        style={{
          background: "var(--bg-primary)",
          border: "1px solid var(--border)",
          color: "var(--text-primary)",
          fontFamily: mono ? "monospace" : undefined,
        }}
      />
    </div>
  );
}

// ---- Provider Card ----

function ProviderCard({
  config,
  onDelete,
  onUpdated,
}: {
  config: ProviderConfig;
  onDelete: () => void;
  onUpdated: (updated: ProviderConfig) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [status, setStatus] = useState<ConnectionStatus>("idle");
  const [statusError, setStatusError] = useState<string>();
  const [form, setForm] = useState<ProviderFormState>({
    id: config.id,
    name: config.name,
    type: config.type,
    apiKey: config.apiKey ?? "",
    baseUrl: config.baseUrl,
    model: config.model ?? "",
    maxTokens: config.maxTokens?.toString() ?? "",
    temperature: config.temperature?.toString() ?? "",
    proxyEnabled: !!config.proxy,
    proxyProtocol: config.proxy?.protocol ?? "http",
    proxyHost: config.proxy?.host ?? "",
    proxyPort: config.proxy?.port?.toString() ?? "7890",
    proxyUser: config.proxy?.auth?.username ?? "",
    proxyPass: config.proxy?.auth?.password ?? "",
    customHeadersRaw: config.customHeaders ? JSON.stringify(config.customHeaders, null, 2) : "",
  });

  const patch = (field: Partial<ProviderFormState>) => setForm((f) => ({ ...f, ...field }));

  async function testConnection() {
    setStatus("testing");
    setStatusError(undefined);
    try {
      const cfg = formToConfig(form);
      const registry = new ProviderRegistry();
      const provider = registry.register(cfg);
      const result = await provider.testConnection();
      if (result.success) {
        setStatus("success");
      } else {
        setStatus("error");
        setStatusError(result.error);
      }
    } catch (e) {
      setStatus("error");
      setStatusError(String(e));
    }
  }

  async function handleSave() {
    const cfg = formToConfig(form);
    let encryptedApiKey: string | undefined;
    if (form.apiKey) {
      try {
        encryptedApiKey = await invoke<string>("encrypt_secret", { plaintext: form.apiKey });
      } catch {
        encryptedApiKey = form.apiKey; // fallback
      }
    }
    await saveProvider({ ...cfg, encryptedApiKey });
    onUpdated(cfg);
    setExpanded(false);
  }

  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{ border: "1px solid var(--border)", background: "var(--bg-card)" }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none hover:bg-[var(--bg-hover)]"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm truncate" style={{ color: "var(--text-primary)" }}>
            {config.name || "未命名 Provider"}
          </div>
          <div className="text-xs mt-0.5 flex items-center gap-2" style={{ color: "var(--text-muted)" }}>
            <span
              className="px-1.5 py-0.5 rounded text-xs font-mono"
              style={{ background: "var(--bg-hover)", color: "var(--text-secondary)" }}
            >
              {config.type}
            </span>
            <span className="truncate">{config.model}</span>
            {config.proxy && (
              <span className="text-xs" style={{ color: "var(--warning)" }}>
                proxy
              </span>
            )}
          </div>
        </div>

        <StatusBadge status={status} error={statusError} />

        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="p-1.5 rounded hover:bg-red-500/20 transition-colors"
          title="删除"
        >
          <Trash2 size={14} style={{ color: "var(--error)" }} />
        </button>

        {expanded ? (
          <ChevronUp size={16} style={{ color: "var(--text-muted)" }} />
        ) : (
          <ChevronDown size={16} style={{ color: "var(--text-muted)" }} />
        )}
      </div>

      {/* Expanded form */}
      {expanded && (
        <div
          className="px-4 pb-4 pt-2 flex flex-col gap-3"
          style={{ borderTop: "1px solid var(--border)" }}
        >
          <div className="grid grid-cols-2 gap-3">
            <InputField label="显示名称" value={form.name} onChange={(v) => patch({ name: v })} placeholder="My Claude" />
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
                类型
              </label>
              <select
                value={form.type}
                onChange={(e) => patch({ type: e.target.value as ProviderConfig["type"] })}
                className="rounded-md px-3 py-1.5 text-sm outline-none"
                style={{
                  background: "var(--bg-primary)",
                  border: "1px solid var(--border)",
                  color: "var(--text-primary)",
                }}
              >
                {PROVIDER_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <InputField
            label="API Key"
            value={form.apiKey}
            onChange={(v) => patch({ apiKey: v })}
            placeholder="sk-..."
            type="password"
            mono
          />

          <div className="grid grid-cols-2 gap-3">
            <InputField
              label="Base URL"
              value={form.baseUrl}
              onChange={(v) => patch({ baseUrl: v })}
              placeholder="https://api.anthropic.com"
              mono
            />
            <InputField
              label="模型 ID"
              value={form.model}
              onChange={(v) => patch({ model: v })}
              placeholder="claude-sonnet-4-6"
              mono
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <InputField
              label="Max Tokens"
              value={form.maxTokens}
              onChange={(v) => patch({ maxTokens: v })}
              placeholder="8192"
            />
            <InputField
              label="Temperature"
              value={form.temperature}
              onChange={(v) => patch({ temperature: v })}
              placeholder="0.7"
            />
          </div>

          {/* Proxy */}
          <div
            className="rounded-md p-3 flex flex-col gap-2"
            style={{ background: "var(--bg-primary)", border: "1px solid var(--border)" }}
          >
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={form.proxyEnabled}
                onChange={(e) => patch({ proxyEnabled: e.target.checked })}
                className="rounded"
              />
              <span style={{ color: "var(--text-secondary)" }}>启用代理</span>
            </label>

            {form.proxyEnabled && (
              <div className="grid grid-cols-3 gap-2 mt-1">
                <div className="flex flex-col gap-1">
                  <label className="text-xs" style={{ color: "var(--text-secondary)" }}>
                    协议
                  </label>
                  <select
                    value={form.proxyProtocol}
                    onChange={(e) => patch({ proxyProtocol: e.target.value as "http" | "https" | "socks5" })}
                    className="rounded-md px-2 py-1.5 text-sm"
                    style={{
                      background: "var(--bg-card)",
                      border: "1px solid var(--border)",
                      color: "var(--text-primary)",
                    }}
                  >
                    <option value="http">HTTP</option>
                    <option value="https">HTTPS</option>
                    <option value="socks5">SOCKS5</option>
                  </select>
                </div>
                <InputField
                  label="Host"
                  value={form.proxyHost}
                  onChange={(v) => patch({ proxyHost: v })}
                  placeholder="127.0.0.1"
                  mono
                />
                <InputField
                  label="Port"
                  value={form.proxyPort}
                  onChange={(v) => patch({ proxyPort: v })}
                  placeholder="7890"
                />
              </div>
            )}
          </div>

          {/* Custom headers */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
              自定义 Headers（JSON）
            </label>
            <textarea
              value={form.customHeadersRaw}
              onChange={(e) => patch({ customHeadersRaw: e.target.value })}
              placeholder={'{"X-Custom-Header": "value"}'}
              rows={3}
              className="rounded-md px-3 py-2 text-xs font-mono outline-none resize-none"
              style={{
                background: "var(--bg-primary)",
                border: "1px solid var(--border)",
                color: "var(--text-primary)",
              }}
            />
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={testConnection}
              disabled={status === "testing"}
              className="px-3 py-1.5 rounded-md text-sm font-medium transition-colors disabled:opacity-50"
              style={{
                background: "var(--bg-hover)",
                border: "1px solid var(--border)",
                color: "var(--text-primary)",
              }}
            >
              {status === "testing" ? "测试中..." : "测试连接"}
            </button>
            <button
              onClick={handleSave}
              className="px-3 py-1.5 rounded-md text-sm font-medium transition-colors"
              style={{ background: "var(--accent)", color: "#fff" }}
            >
              保存
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---- Preset Picker ----

function PresetPicker({ onSelect }: { onSelect: (preset: ProviderPreset) => void }) {
  const [open, setOpen] = useState(false);
  const categories = [...new Set(BUILT_IN_PRESETS.map((p) => p.category))];
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium"
        style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
      >
        <Copy size={14} />
        从预设导入
        <ChevronDown size={14} />
      </button>

      {open && (
        <div
          className="absolute left-0 mt-1 rounded-lg shadow-xl z-50 overflow-hidden"
          style={{
            top: "100%",
            minWidth: 240,
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
          }}
        >
          {categories.map((cat) => (
            <div key={cat}>
              <div
                className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide"
                style={{ color: "var(--text-muted)", background: "var(--bg-secondary)" }}
              >
                {cat}
              </div>
              {BUILT_IN_PRESETS.filter((p) => p.category === cat).map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => {
                    onSelect(preset);
                    setOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-[var(--bg-hover)] transition-colors"
                  style={{ color: "var(--text-primary)" }}
                >
                  <div>{preset.name}</div>
                  <div className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                    {preset.description}
                  </div>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---- Main Page ----

export default function SettingsPage() {
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadProviders();
  }, []);

  async function loadProviders() {
    setLoading(true);
    try {
      const rows = await getAllProviders();
      const configs: ProviderConfig[] = [];
      for (const row of rows) {
        let decryptedKey: string | undefined;
        if (row.api_key) {
          try {
            decryptedKey = await invoke<string>("decrypt_secret", { ciphertext: row.api_key });
          } catch {
            decryptedKey = row.api_key; // fallback
          }
        }
        configs.push(storedToConfig(row, decryptedKey));
      }
      setProviders(configs);
    } catch (e) {
      console.error("Failed to load providers:", e);
    } finally {
      setLoading(false);
    }
  }

  function addBlank() {
    const blank: ProviderConfig = {
      id: `provider-${Date.now()}`,
      name: "",
      type: "openai",
      baseUrl: "",
      model: "",
    };
    setProviders((p) => [blank, ...p]);
  }

  function addFromPreset(preset: ProviderPreset) {
    const config: ProviderConfig = {
      id: `${preset.id}-${Date.now()}`,
      name: preset.name,
      type: preset.type,
      baseUrl: preset.baseUrl,
      model: preset.defaultModel ?? "",
    };
    setProviders((p) => [config, ...p]);
  }

  async function handleDelete(id: string) {
    await deleteProvider(id);
    setProviders((p) => p.filter((c) => c.id !== id));
  }

  function handleUpdated(updated: ProviderConfig) {
    setProviders((p) => p.map((c) => (c.id === updated.id ? updated : c)));
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center justify-between px-6 py-4 shrink-0"
        style={{ borderBottom: "1px solid var(--border)", background: "var(--bg-secondary)" }}
      >
        <div>
          <h1 className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>
            AI 服务商配置
          </h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
            配置 API Key、自定义端点和代理节点
          </p>
        </div>

        <div className="flex items-center gap-2">
          <PresetPicker onSelect={addFromPreset} />
          <button
            onClick={() => {
              // Export all providers as JSON (without API keys for safety)
              const exportData = providers.map(({ apiKey, ...rest }) => rest);
              const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = "omnicoder-providers.json";
              a.click();
              URL.revokeObjectURL(url);
            }}
            className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium"
            style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
            title="导出配置（不含 API Key）"
          >
            <Download size={14} />
          </button>
          <button
            onClick={() => {
              const input = document.createElement("input");
              input.type = "file";
              input.accept = ".json";
              input.onchange = async (e) => {
                const file = (e.target as HTMLInputElement).files?.[0];
                if (!file) return;
                try {
                  const text = await file.text();
                  const imported = JSON.parse(text) as ProviderConfig[];
                  if (Array.isArray(imported)) {
                    for (const cfg of imported) {
                      if (cfg.id && cfg.name && cfg.baseUrl) {
                        cfg.id = `${cfg.id}-${Date.now()}`;
                        setProviders((p) => [...p, cfg]);
                      }
                    }
                  }
                } catch { /* invalid JSON */ }
              };
              input.click();
            }}
            className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium"
            style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
            title="导入配置"
          >
            <Upload size={14} />
          </button>
          <button
            onClick={addBlank}
            className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors"
            style={{ background: "var(--accent)", color: "#fff" }}
          >
            <Plus size={14} />
            添加服务商
          </button>
        </div>
      </div>

      {/* Provider list */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {loading ? (
          <div className="flex items-center justify-center py-16" style={{ color: "var(--text-muted)" }}>
            <Loader2 size={20} className="animate-spin mr-2" />
            加载中...
          </div>
        ) : providers.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center py-20 text-center gap-3"
            style={{ color: "var(--text-muted)" }}
          >
            <div className="text-4xl opacity-30">🔌</div>
            <p className="text-sm">还没有配置任何 AI 服务商</p>
            <p className="text-xs">点击「添加服务商」或从预设导入</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3 max-w-3xl">
            {providers.map((config) => (
              <ProviderCard
                key={config.id}
                config={config}
                onDelete={() => handleDelete(config.id)}
                onUpdated={handleUpdated}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
