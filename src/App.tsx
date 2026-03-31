import { HashRouter, Routes, Route, NavLink, Navigate } from "react-router-dom";
import { Settings, MessageSquare, Users, BarChart2, Bot, Code2 } from "lucide-react";
import SettingsPage from "./ui/pages/SettingsPage";
import ChatPage from "./ui/pages/ChatPage";
import CodePage from "./ui/pages/CodePage";
import AgentSetupPage from "./ui/pages/AgentSetupPage";
import StatsPage from "./ui/pages/StatsPage";

const navItems = [
  { to: "/chat", icon: MessageSquare, label: "Chat" },
  { to: "/code", icon: Code2, label: "Code" },
  { to: "/agents", icon: Users, label: "Agents" },
  { to: "/settings", icon: Settings, label: "Settings" },
  { to: "/stats", icon: BarChart2, label: "Stats" },
];

function Sidebar() {
  return (
    <aside
      className="flex flex-col items-center gap-1 py-3 px-1 border-r"
      style={{
        width: 56,
        background: "var(--bg-secondary)",
        borderColor: "var(--border)",
        flexShrink: 0,
      }}
    >
      {/* Logo */}
      <div className="mb-4 mt-1">
        <Bot size={28} color="var(--accent)" />
      </div>

      {navItems.map(({ to, icon: Icon, label }) => (
        <NavLink
          key={to}
          to={to}
          title={label}
          className={({ isActive }) =>
            `flex items-center justify-center rounded-lg p-2 transition-colors ${
              isActive
                ? "bg-[var(--accent)] text-white"
                : "text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
            }`
          }
          style={{ width: 36, height: 36 }}
        >
          <Icon size={18} />
        </NavLink>
      ))}
    </aside>
  );
}

export default function App() {
  return (
    <HashRouter>
      <div className="flex" style={{ height: "100vh", overflow: "hidden" }}>
        <Sidebar />
        <main className="flex-1 overflow-hidden" style={{ background: "var(--bg-primary)" }}>
          <Routes>
            <Route path="/" element={<Navigate to="/chat" replace />} />
            <Route path="/chat" element={<ChatPage />} />
            <Route path="/code" element={<CodePage />} />
            <Route path="/agents" element={<AgentSetupPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/stats" element={<StatsPage />} />
          </Routes>
        </main>
      </div>
    </HashRouter>
  );
}
