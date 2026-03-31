import { BarChart2 } from "lucide-react";

export default function StatsPage() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4" style={{ color: "var(--text-muted)" }}>
      <BarChart2 size={48} className="opacity-20" />
      <p className="text-sm">使用统计 — Phase 5 实现中</p>
    </div>
  );
}
