#!/bin/bash
MODEL_ID=$1
SCRIPT_DIR=$(dirname "$0")                     # src-tauri/src
APP_DIR="$SCRIPT_DIR/../model_server"          # src-tauri/model_server

cd "$APP_DIR" || exit
MODEL_ID=$MODEL_ID python3 app.py
