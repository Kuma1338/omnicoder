# OmniCoder

**Multi-AI Coding Agent Orchestrator** — Combine Claude, GPT-4o, Gemini, Ollama, and more into a unified coding team.

<p align="center">
  <img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-blue" />
  <img src="https://img.shields.io/badge/license-MIT-green" />
  <img src="https://img.shields.io/badge/version-1.0.0-orange" />
</p>

**English** | [中文](./README_CN.md)

## What is OmniCoder?

OmniCoder is a desktop application that lets you **orchestrate multiple AI models** working together on coding tasks. Instead of talking to one AI at a time, you can build a team:

- **Claude Opus** as the Director — plans and delegates
- **OpenAI GPT-5.3-Codex** as the Coder — writes code and runs commands
- **Gemini** as the Reviewer — checks code quality
- **Ollama (local)** as the Tester — runs tests without API costs

Each agent has role-based permissions and its own tools. The Director plans, workers execute, and results are reviewed — all in one unified interface.

## Features

### Multi-Provider Support
Configure any number of AI providers with independent settings:
- **Anthropic** (Claude Opus 4.6, Sonnet 4.6, Haiku 4.5)
- **OpenAI** (GPT-5.4, GPT-5.3-Codex, GPT-5.4 Mini, o3)
- **Google Gemini** (3.1 Pro, 3.1 Flash-Lite)
- **Ollama** (local models — Qwen, Llama, DeepSeek, etc.)
- **Custom** (OpenRouter, Together.ai, DeepSeek V3, Groq, Mistral Large 3, xAI Grok 4.20, or any OpenAI-compatible endpoint)

Each provider supports:
- Custom base URLs (for relay/proxy services)
- HTTP/HTTPS/SOCKS5 proxy per provider
- Custom headers
- API key encryption (Windows DPAPI)

### Single Agent Mode
Pick any provider and start coding. Full tool access:
- File read/write/edit with line numbers
- Shell command execution with timeout
- File search (glob patterns)
- Content search (regex grep)
- Web search and fetch

### Multi-Agent Mode (Director-Worker)
Build a team of AI agents with different roles:

| Role | Permissions | Best For |
|------|-----------|----------|
| **Director** | Read-only + spawn sub-agents | Planning, delegation, review |
| **Coder** | Full (files, shell, network) | Writing code, running commands |
| **Reviewer** | Read-only | Code review, quality checks |
| **Tester** | Shell execution only | Running tests |
| **Researcher** | Read-only + network | Documentation lookup |

Workflow: `User Request → Director Plans → Workers Execute → Director Reviews → Final Answer`

### MCP Support
Compatible with Claude Code's `.mcp.json` format. Your existing MCP servers work out of the box.

### Built-in Tools (9 core tools)
| Tool | Description | Read-only |
|------|------------|-----------|
| `bash` | Execute shell commands | No |
| `file_read` | Read files with line numbers | Yes |
| `file_write` | Create or overwrite files | No |
| `file_edit` | Exact string replacement editing | No |
| `glob` | File name pattern search | Yes |
| `grep` | Content search with regex | Yes |
| `web_fetch` | Fetch URL content | Yes |
| `web_search` | Web search | Yes |
| `todo_write` | Task tracking | No |

## Quick Start

### Option 1: Download from Releases (Recommended)
Download the latest installer for your platform from [Releases](../../releases):

| Platform | File | Notes |
|----------|------|-------|
| **Windows** | `omnicoder_*_x64-setup.exe` | NSIS installer, double-click |
| **macOS (ARM)** | `omnicoder_*_aarch64.dmg` | Apple Silicon (M1/M2/M3/M4) |
| **macOS (Intel)** | `omnicoder_*_x64.dmg` | Intel Mac |
| **Linux** | `omnicoder_*_amd64.AppImage` | Run directly, no install needed |
| **Linux (deb)** | `omnicoder_*_amd64.deb` | Debian/Ubuntu |

**No Node.js or Rust required.** Download → Install → Configure API keys → Start coding.

### Option 2: Build from Source
```bash
# Prerequisites: Node.js 18+, Rust 1.70+
git clone https://github.com/Kuma1338/omnicoder.git
cd omnicoder
npm install

# Development
npm run tauri dev

# Production build
npm run tauri build
```

### Option 3: CLI Mode (No GUI)
```bash
# Run directly in terminal — no Tauri needed
npm run cli -- --provider anthropic --model claude-sonnet-4-6 --api-key sk-ant-...

# Or with OpenAI
npm run cli -- --provider openai --model gpt-5.4 --api-key sk-...

# Use environment variables
export ANTHROPIC_API_KEY=sk-ant-...
npm run cli
```

## Architecture

```
┌─────────────────────────────────────────────────┐
│              OmniCoder Desktop                   │
│            (Tauri 2: Rust + React)               │
├──────────┬──────────┬──────────┬────────────────┤
│ Settings │  Agent   │  Chat    │  Stats         │
│  Panel   │  Config  │  REPL    │  Dashboard     │
└────┬─────┴────┬─────┴────┬─────┴────────────────┘
     │          │          │
     ▼          ▼          ▼
┌─────────────────────────────────────────────────┐
│           Core Engine (TypeScript)               │
├─────────────┬───────────┬───────────┬───────────┤
│  Provider   │  Agent    │  Tool     │  Config   │
│  Registry   │  Orches-  │  System   │  Manager  │
│             │  trator   │           │           │
│ 5 Adapters  │ Director  │ 10 Core   │ SQLite    │
│ 10 Presets  │ -Worker   │ Tools     │ Keychain  │
│             │ Flow      │ + MCP     │           │
└─────────────┴───────────┴───────────┴───────────┘
```

## Tech Stack

| Layer | Choice | Why |
|-------|--------|-----|
| Desktop | **Tauri 2** (Rust + React) | 3.6MB installer, native performance |
| Frontend | **React + Tailwind CSS** | Fast UI development |
| Backend | **TypeScript** core engine | Shared types, async streaming |
| Database | **SQLite** (Tauri plugin) | Embedded, zero-config |
| Security | **DPAPI / Keychain / libsecret** | OS-native API key encryption per platform |

## Comparison

| Feature | OmniCoder | OpenCode | Aider | Cline |
|---------|:---------:|:--------:|:-----:|:-----:|
| Multi-AI orchestration | ✅ | ❌ | ❌ | ❌ |
| Role-based agents | ✅ | ❌ | ❌ | ❌ |
| Built-in tool system | ✅ | ✅ | ✅ | ✅ |
| Desktop GUI | ✅ | ❌ | ❌ | VS Code |
| MCP support | ✅ | ✅ | ❌ | ✅ |
| Proxy per provider | ✅ | ❌ | ❌ | ❌ |
| Custom relay endpoints | ✅ | ✅ | ✅ | ✅ |
| Standalone EXE | ✅ | ❌ | ❌ | ❌ |

## Roadmap

- [x] v0.1 — Core engine + Single/Multi agent + Settings UI + Windows EXE + Session persistence + Stats
- [x] v0.2 — Cross-platform: macOS (Keychain) + Linux (libsecret) + GitHub Actions CI/CD
- [x] v1.0 — Full MCP stdio transport, CLI mode, config import/export
- [ ] v2.0 — DAG workflow editor, cloud sync, VS Code extension

## License

MIT

---

**OmniCoder** — One interface, all AIs, working together.
