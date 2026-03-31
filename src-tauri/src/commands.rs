/// Tauri commands for shell execution, file glob, and grep

use std::process::Command;
use std::time::{Duration, Instant};
use serde::Serialize;

#[derive(Serialize)]
pub struct CommandOutput {
    pub stdout: String,
    pub stderr: String,
    pub exit_code: i32,
}

#[tauri::command]
pub fn run_command(command: String, cwd: String, timeout: u64) -> Result<CommandOutput, String> {
    let timeout_dur = Duration::from_millis(timeout);

    #[cfg(target_os = "windows")]
    let mut child = Command::new("cmd")
        .args(["/C", &command])
        .current_dir(&cwd)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| e.to_string())?;

    #[cfg(not(target_os = "windows"))]
    let mut child = Command::new("sh")
        .args(["-c", &command])
        .current_dir(&cwd)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| e.to_string())?;

    // Poll for completion with timeout
    let start = Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                // Process exited — read remaining pipe data directly
                use std::io::Read;
                let mut stdout_buf = Vec::new();
                let mut stderr_buf = Vec::new();
                if let Some(mut out) = child.stdout.take() {
                    let _ = out.read_to_end(&mut stdout_buf);
                }
                if let Some(mut err) = child.stderr.take() {
                    let _ = err.read_to_end(&mut stderr_buf);
                }
                return Ok(CommandOutput {
                    stdout: String::from_utf8_lossy(&stdout_buf).into_owned(),
                    stderr: String::from_utf8_lossy(&stderr_buf).into_owned(),
                    exit_code: status.code().unwrap_or(-1),
                });
            }
            Ok(None) => {
                // Still running — check timeout
                if start.elapsed() > timeout_dur {
                    let _ = child.kill();
                    return Err(format!("Command timed out after {}ms", timeout));
                }
                std::thread::sleep(Duration::from_millis(50));
            }
            Err(e) => return Err(e.to_string()),
        }
    }
}

#[tauri::command]
pub fn glob_files(pattern: String, path: String) -> Result<Vec<String>, String> {
    let _base = std::path::Path::new(&path);
    let full_pattern = if pattern.starts_with('/') || pattern.starts_with("C:") || pattern.starts_with("D:") {
        pattern.clone()
    } else {
        format!("{}/{}", path.trim_end_matches(['/', '\\']), pattern)
    };

    let mut matches: Vec<(String, std::time::SystemTime)> = Vec::new();

    for entry in glob::glob(&full_pattern).map_err(|e| e.to_string())? {
        match entry {
            Ok(path_buf) => {
                let modified = path_buf.metadata()
                    .and_then(|m| m.modified())
                    .unwrap_or(std::time::SystemTime::UNIX_EPOCH);
                matches.push((path_buf.to_string_lossy().into_owned(), modified));
            }
            Err(_) => continue,
        }
    }

    // Sort by modification time, newest first
    matches.sort_by(|a, b| b.1.cmp(&a.1));

    Ok(matches.into_iter().map(|(p, _)| p).collect())
}

#[tauri::command]
pub fn grep_files(
    pattern: String,
    path: String,
    glob: Option<String>,
    case_insensitive: bool,
    max_results: usize,
) -> Result<Vec<String>, String> {
    use std::io::BufRead;

    let mut regex_builder = regex::RegexBuilder::new(&pattern);
    regex_builder.case_insensitive(case_insensitive);
    let re = regex_builder.build().map_err(|e| e.to_string())?;
    let mut results: Vec<String> = Vec::new();
    let _search_path = std::path::Path::new(&path);

    let glob_pattern = glob.as_deref().unwrap_or("**/*");
    let full_glob = format!("{}/{}", path.trim_end_matches(['/', '\\']), glob_pattern);

    for entry in glob::glob(&full_glob).map_err(|e| e.to_string())? {
        if results.len() >= max_results {
            break;
        }
        let path_buf = match entry {
            Ok(p) if p.is_file() => p,
            _ => continue,
        };

        let file = match std::fs::File::open(&path_buf) {
            Ok(f) => f,
            Err(_) => continue,
        };

        let reader = std::io::BufReader::new(file);
        for (line_num, line) in reader.lines().enumerate() {
            if results.len() >= max_results {
                break;
            }
            let line = match line {
                Ok(l) => l,
                Err(_) => continue,
            };
            if re.is_match(&line) {
                results.push(format!(
                    "{}:{}: {}",
                    path_buf.display(),
                    line_num + 1,
                    line.trim()
                ));
            }
        }
    }

    Ok(results)
}

// --- MCP stdio transport ---
// Spawns child processes, communicates via JSON-RPC over stdin/stdout

use std::sync::Mutex;
use std::collections::HashMap;
use std::io::{BufRead, Write as IoWrite};

#[derive(Serialize)]
pub struct McpConnectResult {
    pub tools: Vec<McpToolInfo>,
    pub resources: Vec<McpResourceInfo>,
}

#[derive(Serialize)]
pub struct McpToolInfo {
    pub name: String,
    pub description: String,
    pub input_schema: serde_json::Value,
}

#[derive(Serialize)]
pub struct McpResourceInfo {
    pub uri: String,
    pub name: String,
    pub description: Option<String>,
    pub mime_type: Option<String>,
}

#[derive(Serialize)]
pub struct McpToolResult {
    pub content: String,
    pub is_error: bool,
}

// Hold child process handles for active MCP servers
static MCP_PROCESSES: std::sync::LazyLock<Mutex<HashMap<String, std::process::Child>>> =
    std::sync::LazyLock::new(|| Mutex::new(HashMap::new()));

fn mcp_jsonrpc_request(child: &mut std::process::Child, method: &str, params: serde_json::Value) -> Result<serde_json::Value, String> {
    let stdin = child.stdin.as_mut().ok_or("MCP process stdin not available")?;
    let stdout = child.stdout.as_mut().ok_or("MCP process stdout not available")?;

    let request = serde_json::json!({
        "jsonrpc": "2.0",
        "id": 1,
        "method": method,
        "params": params,
    });

    let request_str = serde_json::to_string(&request).map_err(|e| e.to_string())?;

    // MCP uses Content-Length header framing
    let header = format!("Content-Length: {}\r\n\r\n", request_str.len());
    stdin.write_all(header.as_bytes()).map_err(|e| e.to_string())?;
    stdin.write_all(request_str.as_bytes()).map_err(|e| e.to_string())?;
    stdin.flush().map_err(|e| e.to_string())?;

    // Read response with Content-Length framing
    let mut reader = std::io::BufReader::new(stdout);
    let mut header_line = String::new();
    let mut content_length: usize = 0;

    // Read headers until empty line
    loop {
        header_line.clear();
        reader.read_line(&mut header_line).map_err(|e| e.to_string())?;
        let trimmed = header_line.trim();
        if trimmed.is_empty() {
            break;
        }
        if let Some(len_str) = trimmed.strip_prefix("Content-Length: ") {
            content_length = len_str.parse().map_err(|e: std::num::ParseIntError| e.to_string())?;
        }
    }

    if content_length == 0 {
        return Err("No Content-Length in MCP response".to_string());
    }

    let mut body = vec![0u8; content_length];
    std::io::Read::read_exact(&mut reader, &mut body).map_err(|e| e.to_string())?;

    let response: serde_json::Value = serde_json::from_slice(&body).map_err(|e| e.to_string())?;

    if let Some(error) = response.get("error") {
        return Err(format!("MCP error: {}", error));
    }

    Ok(response.get("result").cloned().unwrap_or(serde_json::Value::Null))
}

#[tauri::command]
pub fn mcp_connect(
    command: String,
    args: Vec<String>,
    env: std::collections::HashMap<String, String>,
) -> Result<McpConnectResult, String> {
    let mut cmd = Command::new(&command);
    cmd.args(&args)
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::null());

    for (k, v) in &env {
        cmd.env(k, v);
    }

    let mut child = cmd.spawn().map_err(|e| format!("Failed to spawn MCP server '{}': {}", command, e))?;

    // Send initialize request
    let _init_result = mcp_jsonrpc_request(&mut child, "initialize", serde_json::json!({
        "protocolVersion": "2024-11-05",
        "capabilities": {},
        "clientInfo": { "name": "omnicoder", "version": "0.2.0" }
    }))?;

    // Send initialized notification (no response expected for notifications, but send anyway)
    if let Some(stdin) = child.stdin.as_mut() {
        let notif = serde_json::json!({
            "jsonrpc": "2.0",
            "method": "notifications/initialized",
        });
        let notif_str = serde_json::to_string(&notif).unwrap_or_default();
        let header = format!("Content-Length: {}\r\n\r\n", notif_str.len());
        let _ = stdin.write_all(header.as_bytes());
        let _ = stdin.write_all(notif_str.as_bytes());
        let _ = stdin.flush();
    }

    // List tools
    let tools_result = mcp_jsonrpc_request(&mut child, "tools/list", serde_json::json!({}))
        .unwrap_or(serde_json::Value::Null);

    let tools: Vec<McpToolInfo> = if let Some(tools_arr) = tools_result.get("tools").and_then(|t| t.as_array()) {
        tools_arr.iter().filter_map(|t| {
            Some(McpToolInfo {
                name: t.get("name")?.as_str()?.to_string(),
                description: t.get("description").and_then(|d| d.as_str()).unwrap_or("").to_string(),
                input_schema: t.get("inputSchema").cloned().unwrap_or(serde_json::json!({"type": "object"})),
            })
        }).collect()
    } else {
        vec![]
    };

    // List resources
    let resources_result = mcp_jsonrpc_request(&mut child, "resources/list", serde_json::json!({}))
        .unwrap_or(serde_json::Value::Null);

    let resources: Vec<McpResourceInfo> = if let Some(res_arr) = resources_result.get("resources").and_then(|r| r.as_array()) {
        res_arr.iter().filter_map(|r| {
            Some(McpResourceInfo {
                uri: r.get("uri")?.as_str()?.to_string(),
                name: r.get("name")?.as_str()?.to_string(),
                description: r.get("description").and_then(|d| d.as_str()).map(|s| s.to_string()),
                mime_type: r.get("mimeType").and_then(|m| m.as_str()).map(|s| s.to_string()),
            })
        }).collect()
    } else {
        vec![]
    };

    // Store the child process for later tool calls
    let server_id = format!("mcp-{}", command.replace(['/', '\\', ' '], "-"));
    MCP_PROCESSES.lock().map_err(|e| e.to_string())?.insert(server_id, child);

    Ok(McpConnectResult { tools, resources })
}

#[tauri::command]
pub fn mcp_call_tool(
    server_id: String,
    tool_name: String,
    input: serde_json::Value,
) -> Result<McpToolResult, String> {
    let mut processes = MCP_PROCESSES.lock().map_err(|e| e.to_string())?;
    let child = processes.get_mut(&server_id)
        .ok_or_else(|| format!("MCP server '{}' not connected", server_id))?;

    let result = mcp_jsonrpc_request(child, "tools/call", serde_json::json!({
        "name": tool_name,
        "arguments": input,
    }))?;

    let content = if let Some(content_arr) = result.get("content").and_then(|c| c.as_array()) {
        content_arr.iter()
            .filter_map(|c| c.get("text").and_then(|t| t.as_str()))
            .collect::<Vec<_>>()
            .join("\n")
    } else {
        result.to_string()
    };

    let is_error = result.get("isError").and_then(|e| e.as_bool()).unwrap_or(false);

    Ok(McpToolResult { content, is_error })
}

#[tauri::command]
pub fn mcp_read_resource(
    server_id: String,
    uri: String,
) -> Result<String, String> {
    let mut processes = MCP_PROCESSES.lock().map_err(|e| e.to_string())?;
    let child = processes.get_mut(&server_id)
        .ok_or_else(|| format!("MCP server '{}' not connected", server_id))?;

    let result = mcp_jsonrpc_request(child, "resources/read", serde_json::json!({
        "uri": uri,
    }))?;

    if let Some(contents) = result.get("contents").and_then(|c| c.as_array()) {
        Ok(contents.iter()
            .filter_map(|c| c.get("text").and_then(|t| t.as_str()))
            .collect::<Vec<_>>()
            .join("\n"))
    } else {
        Ok(result.to_string())
    }
}
