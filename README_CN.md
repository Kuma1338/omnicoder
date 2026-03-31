# OmniCoder — 多 AI 协同编码平台

<p align="center">
  <img src="https://img.shields.io/badge/平台-Windows-blue" />
  <img src="https://img.shields.io/badge/许可证-MIT-green" />
  <img src="https://img.shields.io/badge/版本-0.1.0-orange" />
</p>

> **一个界面，所有 AI，协同工作。**

[English](./README.md) | **中文**

---

## 这是什么？

OmniCoder 是一个 Windows 桌面应用，让你**同时使用多个 AI 模型协作编码**。不再是跟一个 AI 聊天，而是组建一个 AI 团队：

- **Claude Opus** 当指挥官 — 分析需求、拆分任务
- **GPT-4o** 当程序员 — 写代码、执行命令
- **Gemini** 当审查员 — 检查代码质量
- **Ollama 本地模型** 当测试员 — 跑测试，零 API 成本

每个 Agent 有独立的角色权限和工具集。指挥官规划，程序员执行，审查员把关 —— 全部在一个界面完成。

## 核心特性

### 多服务商支持
- **Anthropic** — Claude Opus、Sonnet、Haiku
- **OpenAI** — GPT-4o、o3、GPT-4-turbo
- **Google Gemini** — 2.5 Pro、2.5 Flash
- **Ollama** — 本地模型（Qwen、Llama 等）
- **自定义** — OpenRouter、Together.ai、DeepSeek、Groq、Mistral、xAI Grok，或任何 OpenAI 兼容接口

每个服务商独立配置：
- 自定义 API 地址（支持中转站/代理服务）
- HTTP / HTTPS / SOCKS5 代理（每个服务商单独设置）
- 自定义请求头
- API Key 加密存储（Windows DPAPI）

### 单 Agent 模式
选一个模型就能开始编码。内置 9 个核心工具：

| 工具 | 功能 | 只读 |
|------|------|------|
| `bash` | 执行 Shell 命令 | ❌ |
| `file_read` | 读取文件（带行号） | ✅ |
| `file_write` | 创建/覆盖文件 | ❌ |
| `file_edit` | 精确字符串替换编辑 | ❌ |
| `glob` | 文件名模式搜索 | ✅ |
| `grep` | 正则内容搜索 | ✅ |
| `web_fetch` | 获取网页内容 | ✅ |
| `web_search` | 网络搜索 | ✅ |
| `todo_write` | 任务跟踪 | ❌ |

### 多 Agent 模式（指挥官-执行者）
组建 AI 团队，分工协作：

| 角色 | 权限 | 适合场景 |
|------|------|---------|
| **Director 指挥官** | 只读 + 创建子任务 | 需求分析、任务拆分、结果审查 |
| **Coder 程序员** | 完整权限 | 写代码、执行命令 |
| **Reviewer 审查员** | 只读 | 代码审查、质量检查 |
| **Tester 测试员** | 仅 Shell | 运行测试 |
| **Researcher 研究员** | 只读 + 网络 | 查文档、搜资料 |

工作流：`用户需求 → 指挥官规划 → 执行者并行工作 → 指挥官审查 → 最终交付`

### MCP 支持
兼容 Claude Code 的 `.mcp.json` 格式。已有的 MCP 服务器可直接复用。

## 快速开始

### 方式一：下载安装（推荐）
1. 从 [Releases](../../releases) 下载 `omnicoder_0.1.0_x64-setup.exe`
2. 双击安装（无需安装 Node.js 或 Rust）
3. 打开 OmniCoder
4. 进入 **Settings** 页面 → 添加 API Key
5. 开始使用！

### 方式二：从源码构建
```bash
# 前置条件：Node.js 18+, Rust 1.70+
git clone https://github.com/user/omnicoder.git
cd omnicoder
npm install

# 开发模式
npm run tauri dev

# 生产构建
npm run tauri build
```

## 技术架构

```
┌─────────────────────────────────────────────────┐
│              OmniCoder 桌面应用                   │
│            (Tauri 2: Rust + React)               │
├──────────┬──────────┬──────────┬────────────────┤
│ 设置面板  │  Agent   │  对话    │  统计           │
│  API 配置 │  角色配置 │  编码    │  仪表盘         │
└────┬─────┴────┬─────┴────┬─────┴────────────────┘
     │          │          │
     ▼          ▼          ▼
┌─────────────────────────────────────────────────┐
│           核心引擎 (TypeScript)                   │
├─────────────┬───────────┬───────────┬───────────┤
│  Provider   │  Agent    │  工具     │  配置      │
│  注册表     │  编排器    │  系统     │  管理      │
│             │           │           │           │
│ 5 个适配器  │ 指挥官-   │ 9 核心    │ SQLite    │
│ 10 个预设   │ 执行者模式 │ 工具     │ DPAPI     │
│             │           │ + MCP    │           │
└─────────────┴───────────┴───────────┴───────────┘
```

## 技术栈

| 层级 | 选择 | 优势 |
|------|------|------|
| 桌面框架 | **Tauri 2**（Rust + React） | 安装包仅 3.6MB，原生性能 |
| 前端 | **React + Tailwind CSS** | 快速 UI 开发 |
| 后端逻辑 | **TypeScript** 核心引擎 | 类型安全，异步流式 |
| 数据库 | **SQLite**（Tauri 插件） | 内嵌式，零配置 |
| 安全 | **Windows DPAPI** | 系统级 API Key 加密 |

## 路线图

- [x] v0.1 — 核心引擎 + 单/多 Agent + 设置 UI + Windows EXE
- [ ] v0.2 — 会话持久化、费用统计仪表盘、CLI 模式
- [ ] v0.3 — macOS 支持（.dmg）
- [ ] v0.4 — Linux 支持（.AppImage）
- [ ] v1.0 — DAG 工作流编辑器、云端同步、VS Code 插件

## 许可证

MIT

---

**OmniCoder** — 一个界面，所有 AI，协同工作。
