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
