import os
import sys
import argparse
from huggingface_hub import snapshot_download
from pathlib import Path

class UnbufferedWriter:
    def __init__(self, stream):
        self.stream = stream
    def write(self, data):
        self.stream.write(data)
        self.stream.flush()
    def flush(self):
        self.stream.flush()

if len(sys.argv) < 2:
    print("[ERROR] Missing required argument: repo_id\n")
    sys.exit(1)

repo_id = sys.argv[1]

app_support_dir = Path.home() / "Library" / "Application Support" / "ONEKQ"
app_support_dir.mkdir(parents=True, exist_ok=True)
log_path = app_support_dir / "download_log.txt"

with open(log_path, "w", encoding="utf-8") as log_file:
    unbuffered_log = UnbufferedWriter(log_file)
    sys.stderr = unbuffered_log
    try:
        snapshot_download(repo_id=repo_id, local_dir=None)
    finally:
        sys.stderr = sys.__stderr__  # Restore

