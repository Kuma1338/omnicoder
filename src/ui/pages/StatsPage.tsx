import { useState } from "react";
import { BarChart2, Zap, DollarSign, Clock, MessageSquare } from "lucide-react";

interface SessionStats {
  totalSessions: number;
  totalMessages: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  estimatedCost: number;
}

// In-memory stats tracker (persisted to SQLite in v0.2)
const stats: SessionStats = {
  totalSessions: 0,
  totalMessages: 0,
  totalInputTokens: 0,
  totalOutputTokens: 0,
  estimatedCost: 0,
};

export function trackUsage(inputTokens: number, outputTokens: number) {
  stats.totalMessages++;
  stats.totalInputTokens += inputTokens;
  stats.totalOutputTokens += outputTokens;
  // Rough cost estimate (Claude Sonnet pricing as baseline)
  stats.estimatedCost += (inputTokens * 3 + outputTokens * 15) / 1_000_000;
}

export function trackSession() {
  stats.totalSessions++;
}

function StatCard({ icon: Icon, label, value, sub, color }: {
  icon: typeof Zap; label: string; value: string; sub?: string; color: string;
}) {
  return (
    <div className="rounded-lg p-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
      <div className="flex items-center gap-2 mb-2">
        <Icon size={16} style={{ color }} />
        <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>{label}</span>
      </div>
      <div className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>{value}</div>
      {sub && <div className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>{sub}</div>}
    </div>
  );
}

export default function StatsPage() {
  const [, setTick] = useState(0);
  const refresh = () => setTick((t) => t + 1);

  const totalTokens = stats.totalInputTokens + stats.totalOutputTokens;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div
        className="flex items-center justify-between px-6 py-4 shrink-0"
        style={{ borderBottom: "1px solid var(--border)", background: "var(--bg-secondary)" }}
      >
        <div>
          <h1 className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>使用统计</h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>当前会话的 Token 用量和费用估算</p>
        </div>
        <button
          onClick={refresh}
          className="px-3 py-1.5 rounded-md text-sm"
          style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
        >
          刷新
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 max-w-4xl">
          <StatCard icon={MessageSquare} label="对话次数" value={String(stats.totalMessages)} color="var(--accent)" />
          <StatCard
            icon={Zap}
            label="总 Token"
            value={totalTokens > 1000 ? `${(totalTokens / 1000).toFixed(1)}K` : String(totalTokens)}
            sub={`输入 ${stats.totalInputTokens.toLocaleString()} / 输出 ${stats.totalOutputTokens.toLocaleString()}`}
            color="var(--warning)"
          />
          <StatCard
            icon={DollarSign}
            label="预估费用"
            value={`$${stats.estimatedCost.toFixed(4)}`}
            sub="基于 Claude Sonnet 定价估算"
            color="var(--success)"
          />
          <StatCard icon={Clock} label="会话数" value={String(stats.totalSessions)} color="#c084fc" />
        </div>

        {totalTokens === 0 && (
          <div className="mt-12 text-center" style={{ color: "var(--text-muted)" }}>
            <BarChart2 size={48} className="mx-auto mb-3 opacity-20" />
            <p className="text-sm">还没有使用数据</p>
            <p className="text-xs mt-1">开始编码对话后，这里会显示 Token 用量和费用估算</p>
          </div>
        )}
      </div>
    </div>
  );
}
