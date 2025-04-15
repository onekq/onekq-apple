from starlette.responses import Response

from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from mlx_lm import load, stream_generate
import subprocess
import asyncio
import webbrowser
import os
import re
import sys
from pathlib import Path
import psutil
import socket

app = FastAPI()

# CORS setup for frontend access.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

RECOMMENDED_MODEL = os.environ.get("MODEL_ID", "onekq-ai/OneSQL-v0.1-Qwen-1.5B-MLX-4bit")

def assemble_prompt(schema: str, user_query: str) -> str:
    system_message = "You are a SQL expert. Return code only."
    full_prompt = "\n".join([
        f"<|im_start|>system\n{system_message}<|im_end|>",
        f"<|im_start|>user\n{schema}\n-- {user_query}\nGenerate the SQL after thinking step by step:\n SELECT <|im_end|>",
        "<|im_start|>assistant"
    ])
    return full_prompt

def get_download_binary():
    if getattr(sys, 'frozen', False):
        # Production build
        folder = os.path.dirname(sys.executable)
        name = "download"
    else:
        # Dev mode
        folder = os.path.dirname(__file__)
        name = "download.py"

    return os.path.join(folder, name)

def run_download(repo_id):
    if getattr(sys, 'frozen', False):
        cmd = [get_download_binary(), repo_id]
    else:
        cmd = [sys.executable, get_download_binary(), repo_id]

    print(f"Running: {cmd}")
    return subprocess.Popen(cmd)

def kill_process_on_port(port):
    for proc in psutil.process_iter(['pid', 'name']):
        try:
            for conn in proc.connections(kind='inet'):
                if conn.status == psutil.CONN_LISTEN and conn.laddr.port == port:
                    print(f"Killing process {proc.pid} ({proc.name()}) on port {port}")
                    proc.kill()
                    return
        except (psutil.AccessDenied, psutil.NoSuchProcess):
            continue

@app.get("/download_model")
async def download_model(request: Request, model_id: str):
    log_file = Path.home() / "Library" / "Application Support" / "ONEKQ" / "download_log.txt"
    progress_pattern = re.compile(r"model\.safetensors:\s*(\d+)%")

    async def event_stream():
        process = run_download(model_id)

        last_percent = -1

        while True:
            await asyncio.sleep(1)  # Poll every second

            if os.path.exists(log_file):
                with open(log_file, "r", encoding="utf-8") as f:
                    lines = f.readlines()

                for line in reversed(lines):
                    if "model.safetensors:" in line:
                        match = progress_pattern.search(line)
                        if match:
                            percent = int(match.group(1))
                            print(f"📡 Percent update: {percent}%", flush=True)
                            if percent > last_percent:
                                yield f"data: {percent}\n\n"
                                last_percent = percent
                        break  # Only the latest matching line

            if await request.is_disconnected():
                print("🔌 Client disconnected.", flush=True)
                process.terminate()
                break

            if process.poll() is not None:  # download.py finished
                break

        yield f"data: 100\n\n"  # Signal completion

    return StreamingResponse(event_stream(), media_type="text/event-stream")

@app.post("/infer")
async def infer(request: Request):
    data = await request.json()
    schema = data.get("schema")
    user_query = data.get("user_query")
    model_id = data.get("model")
    
    if not schema or not user_query or not model_id:
        raise HTTPException(status_code=400, detail="Missing required fields: schema, user_query, or model")
    
    full_prompt = assemble_prompt(schema, user_query)
    print("Send prompt to ", model_id)

    model, tokenizer = load(model_id)

    def token_stream():
        yield f"-- {user_query}\n"
        yield f"-- query by {model_id}\n\n"

        started = False

        for response in stream_generate(model, tokenizer, full_prompt, max_tokens=512):
            text = response.text

            if text.strip().startswith("```"):
                continue
            if text.strip().endswith("```"):
                text = text.split("```")[0]

            if not started:
                text = text.lstrip(" \n")
                if text.upper().startswith("SELECT"):
                    text = text[6:].lstrip(" \n")
                if text:
                    yield "SELECT "
                    started = True

            if text:
                yield text

    return StreamingResponse(token_stream(), media_type="text/plain")

@app.get("/recommended_model")
async def recommended_model():
    return {"model_id": RECOMMENDED_MODEL}

@app.post("/open_link")
async def open_link(request: Request):
    data = await request.json()
    url = data.get("url")
    if url:
        webbrowser.open(url)
        return {"status": "ok"}
    return {"status": "error", "reason": "Missing URL"}

if __name__ == '__main__':
    import uvicorn
    kill_process_on_port(1431)
    uvicorn.run(app, host="localhost", port=1431, timeout_keep_alive=1)
