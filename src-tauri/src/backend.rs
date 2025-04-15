use sysinfo::{System};
use std::process::{Command, Stdio, Child};
use std::sync::Mutex;
use std::io::{BufRead, BufReader};
use std::thread;
use once_cell::sync::Lazy;
use std::os::unix::process::CommandExt; // for .pre_exec

use nix::unistd::{Pid, setpgid};
use nix::sys::signal::{killpg, Signal};

static CHILD_PROCESS: Lazy<Mutex<Option<Child>>> = Lazy::new(|| Mutex::new(None));

#[tauri::command]
pub fn get_model_variant() -> String {
    let sys = System::new();
    let ram_gb = sys.total_memory() as f64 / (1024.0 * 1024.0);
    let output = Command::new("sysctl").arg("-n").arg("machdep.cpu.brand_string").output();

    let cpu = match output {
        Ok(out) => String::from_utf8_lossy(&out.stdout).to_string(),
        Err(_) => "".to_string(),
    };

    if !(cpu.contains("M1") || cpu.contains("M2") || cpu.contains("M3") || cpu.contains("M4")) {
        return "CPU".to_string(); // No GPU
    }

    if cpu.contains("M2") || cpu.contains("M3") {
        "onekq-ai/OneSQL-v0.1-Qwen-7B-MLX-4bit".to_string()
    } else if cpu.contains("M1") && ram_gb >= 16.0 {
        "onekq-ai/OneSQL-v0.1-Qwen-3B-MLX-4bit".to_string()
    } else {
        "onekq-ai/OneSQL-v0.1-Qwen-1.5B-MLX-4bit".to_string()
    }
}

#[tauri::command]
pub fn start_model_server(model_id: String, app_handle: tauri::AppHandle) -> Result<String, String> {
    println!("\u{1f680} Starting model server with model: {}", model_id);

    let script_path = if cfg!(debug_assertions) {
        // Dev mode — call directly from ./src
        std::path::PathBuf::from("./src/start_model_server.sh")
    } else {
        // Production mode — resolve from Tauri resource bundle
        app_handle
            .path_resolver()
            .resolve_resource("run.sh")
            .ok_or("❌ Could not resolve bundled shell script")?
    };

    let child_result = unsafe {
        Command::new("bash")
            .arg(script_path)
            .arg(&model_id)
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit())
            .pre_exec(|| {
                // Start a new process group
                setpgid(Pid::from_raw(0), Pid::from_raw(0)).map_err(|e| {
                    std::io::Error::new(std::io::ErrorKind::Other, format!("setpgid failed: {}", e))
                })
            })
            .spawn()
    };

    let mut child = child_result.map_err(|e| {
        eprintln!("❌ Failed to launch model server: {}", e);
        e.to_string()
    })?;

    if let Some(stdout) = child.stdout.take() {
        thread::spawn(move || {
            let reader = BufReader::new(stdout);
            for line in reader.lines() {
                match line {
                    Ok(line) => println!("📤 Python: {}", line),
                    Err(e) => eprintln!("❌ Error reading stdout: {}", e),
                }
            }
        });
    }

    *CHILD_PROCESS.lock().unwrap() = Some(child);

    Ok("1431".to_string())
}

pub fn stop_model_server() {
    if let Some(child) = CHILD_PROCESS.lock().unwrap().take() {
        let pid = child.id() as i32;
        println!("🛑 Killing process group of PID: {}", pid);

        if let Err(e) = killpg(Pid::from_raw(pid), Signal::SIGKILL) {
            eprintln!("❌ Failed to kill process group: {}", e);
        } else {
            println!("🛑 Model server process group killed.");
        }
    }
}
