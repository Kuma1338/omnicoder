import { useState, useEffect, useRef } from "react";
import { Folder, File, ChevronRight, ChevronDown, Terminal, Play, FolderOpen, RefreshCw, Home, Code2 } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { readTextFile } from "@tauri-apps/plugin-fs";
import { homeDir, desktopDir } from "@tauri-apps/api/path";

// ---- Types ----

interface FileEntry {
  name: string;
  path: string;
  isDir: boolean;
  children?: FileEntry[];
}

// ---- File Tree Component ----

function FileTreeItem({
  entry,
  depth,
  selectedPath,
  onSelect,
  onToggle,
  expandedDirs,
}: {
  entry: FileEntry;
  depth: number;
  selectedPath: string;
  onSelect: (path: string) => void;
  onToggle: (path: string) => void;
  expandedDirs: Set<string>;
}) {
  const isExpanded = expandedDirs.has(entry.path);
  const isSelected = entry.path === selectedPath;

  return (
    <>
      <div
        className="flex items-center gap-1 px-2 py-0.5 cursor-pointer text-xs hover:bg-[var(--bg-hover)] transition-colors"
        style={{
          paddingLeft: 8 + depth * 16,
          background: isSelected ? "var(--bg-hover)" : undefined,
          color: isSelected ? "var(--accent)" : "var(--text-secondary)",
        }}
        onClick={() => {
          if (entry.isDir) {
            onToggle(entry.path);
          } else {
            onSelect(entry.path);
          }
        }}
      >
        {entry.isDir ? (
          isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />
        ) : (
          <span style={{ width: 12 }} />
        )}
        {entry.isDir ? (
          isExpanded ? <FolderOpen size={13} style={{ color: "var(--warning)" }} /> : <Folder size={13} style={{ color: "var(--warning)" }} />
        ) : (
          <File size={13} style={{ color: getFileColor(entry.name) }} />
        )}
        <span className="truncate">{entry.name}</span>
      </div>
      {entry.isDir && isExpanded && entry.children?.map((child) => (
        <FileTreeItem
          key={child.path}
          entry={child}
          depth={depth + 1}
          selectedPath={selectedPath}
          onSelect={onSelect}
          onToggle={onToggle}
          expandedDirs={expandedDirs}
        />
      ))}
    </>
  );
}

function getFileColor(name: string): string {
  if (name.endsWith(".ts") || name.endsWith(".tsx")) return "#3178c6";
  if (name.endsWith(".js") || name.endsWith(".jsx")) return "#f7df1e";
  if (name.endsWith(".rs")) return "#dea584";
  if (name.endsWith(".py")) return "#3572a5";
  if (name.endsWith(".json")) return "#a8db8f";
  if (name.endsWith(".md")) return "var(--accent)";
  if (name.endsWith(".css") || name.endsWith(".scss")) return "#563d7c";
  if (name.endsWith(".html")) return "#e34c26";
  if (name.endsWith(".toml") || name.endsWith(".yml") || name.endsWith(".yaml")) return "#cb171e";
  return "var(--text-muted)";
}

// ---- Code Viewer ----

function CodeEditor({
  content,
  filePath,
  onSave,
}: {
  content: string;
  filePath: string;
  onSave: (newContent: string) => void;
}) {
  const [editContent, setEditContent] = useState(content);
  const [modified, setModified] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lineCountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setEditContent(content);
    setModified(false);
  }, [content, filePath]);

  // Sync scroll between line numbers and textarea
  function handleScroll() {
    if (textareaRef.current && lineCountRef.current) {
      lineCountRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  }

  const lineCount = editContent.split("\n").length;

  return (
    <div className="flex-1 flex flex-col overflow-hidden" style={{ background: "var(--bg-primary)" }}>
      {/* File header */}
      <div
        className="flex items-center justify-between px-4 py-1.5 text-xs shrink-0"
        style={{ background: "var(--bg-secondary)", borderBottom: "1px solid var(--border)" }}
      >
        <span style={{ color: modified ? "var(--warning)" : "var(--text-muted)" }}>
          {filePath} {modified ? " (未保存)" : ""}
        </span>
        {modified && (
          <button
            onClick={() => {
              onSave(editContent);
              setModified(false);
            }}
            className="px-2 py-0.5 rounded text-xs font-medium"
            style={{ background: "var(--accent)", color: "#fff" }}
          >
            Ctrl+S 保存
          </button>
        )}
      </div>

      {/* Editor area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Line numbers */}
        <div
          ref={lineCountRef}
          className="overflow-hidden shrink-0 text-right font-mono text-xs py-1 select-none"
          style={{
            width: 50,
            color: "var(--text-muted)",
            background: "var(--bg-secondary)",
            borderRight: "1px solid var(--border)",
            lineHeight: "1.5em",
          }}
        >
          {Array.from({ length: lineCount }, (_, i) => (
            <div key={i} className="px-2">{i + 1}</div>
          ))}
        </div>

        {/* Textarea editor */}
        <textarea
          ref={textareaRef}
          value={editContent}
          onChange={(e) => {
            setEditContent(e.target.value);
            setModified(true);
          }}
          onScroll={handleScroll}
          onKeyDown={(e) => {
            // Ctrl+S to save
            if ((e.ctrlKey || e.metaKey) && e.key === "s") {
              e.preventDefault();
              onSave(editContent);
              setModified(false);
            }
            // Tab inserts spaces
            if (e.key === "Tab") {
              e.preventDefault();
              const start = e.currentTarget.selectionStart;
              const end = e.currentTarget.selectionEnd;
              const newVal = editContent.substring(0, start) + "  " + editContent.substring(end);
              setEditContent(newVal);
              setModified(true);
              requestAnimationFrame(() => {
                if (textareaRef.current) {
                  textareaRef.current.selectionStart = textareaRef.current.selectionEnd = start + 2;
                }
              });
            }
          }}
          spellCheck={false}
          className="flex-1 resize-none outline-none font-mono text-xs p-1 overflow-auto"
          style={{
            background: "transparent",
            color: "var(--text-primary)",
            lineHeight: "1.5em",
            tabSize: 2,
            caretColor: "var(--accent)",
          }}
        />
      </div>
    </div>
  );
}

// ---- Terminal Panel ----

function TerminalPanel({
  output,
  onRun,
}: {
  output: string[];
  onRun: (cmd: string) => void;
}) {
  const [cmd, setCmd] = useState("");
  const outputRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    outputRef.current?.scrollTo(0, outputRef.current.scrollHeight);
  }, [output]);

  return (
    <div className="flex flex-col" style={{ height: 200, borderTop: "1px solid var(--border)", background: "var(--bg-secondary)" }}>
      <div className="flex items-center gap-2 px-3 py-1" style={{ borderBottom: "1px solid var(--border)" }}>
        <Terminal size={12} style={{ color: "var(--text-muted)" }} />
        <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>Terminal</span>
      </div>
      <div ref={outputRef} className="flex-1 overflow-auto px-3 py-2 font-mono text-xs" style={{ color: "var(--text-primary)" }}>
        {output.map((line, i) => (
          <div key={i} style={{ color: line.startsWith("[error]") || line.startsWith("[stderr]") ? "var(--error)" : line.startsWith("$") ? "var(--success)" : "var(--text-primary)" }}>
            {line}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 px-3 py-1.5" style={{ borderTop: "1px solid var(--border)" }}>
        <span className="text-xs font-mono" style={{ color: "var(--success)" }}>$</span>
        <input
          value={cmd}
          onChange={(e) => setCmd(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && cmd.trim()) {
              onRun(cmd.trim());
              setCmd("");
            }
          }}
          placeholder="输入命令..."
          className="flex-1 bg-transparent text-xs font-mono outline-none"
          style={{ color: "var(--text-primary)" }}
        />
        <button
          onClick={() => { if (cmd.trim()) { onRun(cmd.trim()); setCmd(""); } }}
          className="p-1 rounded hover:bg-[var(--bg-hover)]"
        >
          <Play size={12} style={{ color: "var(--accent)" }} />
        </button>
      </div>
    </div>
  );
}

// ---- Main Code Page ----

export default function CodePage() {
  const [rootPath, setRootPath] = useState("");
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
  const [selectedFile, setSelectedFile] = useState("");
  const [fileContent, setFileContent] = useState("");
  const [termOutput, setTermOutput] = useState<string[]>(["OmniCoder Terminal — 输入命令执行"]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    desktopDir().then(setRootPath).catch(() => {
      homeDir().then(setRootPath).catch(() => setRootPath("C:/"));
    });
  }, []);

  useEffect(() => {
    if (rootPath) loadDirectory(rootPath);
  }, [rootPath]);

  async function loadDirectory(dirPath: string): Promise<FileEntry[]> {
    try {
      const result = await invoke<Array<{ name: string; path: string; is_dir: boolean; size: number }>>("list_directory", { path: dirPath });
      const entries: FileEntry[] = result.map((e) => ({
        name: e.name,
        path: e.path,
        isDir: e.is_dir,
        children: e.is_dir ? [] : undefined,
      }));
      setFiles(entries);
      return entries;
    } catch {
      return [];
    }
  }

  async function toggleDir(dirPath: string) {
    const newExpanded = new Set(expandedDirs);
    if (newExpanded.has(dirPath)) {
      newExpanded.delete(dirPath);
    } else {
      newExpanded.add(dirPath);
      // Load children via list_directory (correct is_dir detection)
      try {
        const result = await invoke<Array<{ name: string; path: string; is_dir: boolean; size: number }>>("list_directory", { path: dirPath });
        const children: FileEntry[] = result.map((e) => ({
          name: e.name,
          path: e.path,
          isDir: e.is_dir,
          children: e.is_dir ? [] : undefined,
        }));
        setFiles((prev) => updateChildren(prev, dirPath, children));
      } catch { /* ignore */ }
    }
    setExpandedDirs(newExpanded);
  }

  function updateChildren(entries: FileEntry[], targetPath: string, children: FileEntry[]): FileEntry[] {
    return entries.map((entry) => {
      if (entry.path === targetPath) {
        return { ...entry, children };
      }
      if (entry.children) {
        return { ...entry, children: updateChildren(entry.children, targetPath, children) };
      }
      return entry;
    });
  }

  async function selectFile(filePath: string) {
    setSelectedFile(filePath);
    setLoading(true);
    try {
      const content = await readTextFile(filePath);
      setFileContent(content);
    } catch (err) {
      setFileContent(`Error reading file: ${String(err)}`);
    }
    setLoading(false);
  }

  async function runCommand(cmd: string) {
    setTermOutput((prev) => [...prev, `$ ${cmd}`]);
    try {
      const result = await invoke<{ stdout: string; stderr: string; exit_code: number }>("run_command", {
        command: cmd,
        cwd: rootPath,
        timeout: 30000,
      });
      if (result.stdout) {
        setTermOutput((prev) => [...prev, ...result.stdout.split("\n")]);
      }
      if (result.stderr) {
        setTermOutput((prev) => [...prev, ...result.stderr.split("\n").map((l) => `[stderr] ${l}`)]);
      }
      if (result.exit_code !== 0) {
        setTermOutput((prev) => [...prev, `[error] Exit code: ${result.exit_code}`]);
      }
    } catch (err) {
      setTermOutput((prev) => [...prev, `[error] ${String(err)}`]);
    }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Toolbar */}
      <div
        className="flex items-center gap-3 px-4 py-2 shrink-0"
        style={{ borderBottom: "1px solid var(--border)", background: "var(--bg-secondary)" }}
      >
        <Home size={14} style={{ color: "var(--text-muted)" }} />
        <input
          value={rootPath}
          onChange={(e) => setRootPath(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") loadDirectory(rootPath); }}
          className="flex-1 bg-transparent text-xs font-mono outline-none"
          style={{ color: "var(--text-primary)" }}
          placeholder="项目路径..."
        />
        <button
          onClick={() => loadDirectory(rootPath)}
          className="p-1 rounded hover:bg-[var(--bg-hover)]"
          title="刷新"
        >
          <RefreshCw size={13} style={{ color: "var(--text-muted)" }} />
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* File Explorer */}
        <div
          className="overflow-y-auto shrink-0"
          style={{ width: 220, borderRight: "1px solid var(--border)", background: "var(--bg-secondary)" }}
        >
          <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
            Explorer
          </div>
          {files.length === 0 ? (
            <div className="px-3 py-4 text-xs" style={{ color: "var(--text-muted)" }}>
              输入项目路径后按 Enter
            </div>
          ) : (
            files.map((entry) => (
              <FileTreeItem
                key={entry.path}
                entry={entry}
                depth={0}
                selectedPath={selectedFile}
                onSelect={selectFile}
                onToggle={toggleDir}
                expandedDirs={expandedDirs}
              />
            ))
          )}
        </div>

        {/* Code Viewer + Terminal */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {selectedFile ? (
            loading ? (
              <div className="flex-1 flex items-center justify-center" style={{ color: "var(--text-muted)" }}>
                加载中...
              </div>
            ) : (
              <CodeEditor
                content={fileContent}
                filePath={selectedFile}
                onSave={async (newContent) => {
                  try {
                    const { writeTextFile } = await import("@tauri-apps/plugin-fs");
                    await writeTextFile(selectedFile, newContent);
                    setFileContent(newContent);
                    setTermOutput((prev) => [...prev, `[saved] ${selectedFile}`]);
                  } catch (err) {
                    setTermOutput((prev) => [...prev, `[error] Save failed: ${String(err)}`]);
                  }
                }}
              />
            )
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center gap-3" style={{ color: "var(--text-muted)" }}>
              <Code2 size={48} className="opacity-20" />
              <p className="text-sm">选择一个文件查看代码</p>
              <p className="text-xs">或在终端中执行命令</p>
            </div>
          )}

          {/* Terminal */}
          <TerminalPanel output={termOutput} onRun={runCommand} />
        </div>
      </div>
    </div>
  );
}

