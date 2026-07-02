#!/usr/bin/env bash
# Launch the Cowork agent's LangGraph server under WSL.
#
#   wsl bash scripts/serve.sh
#
# Serves the compiled `agent` graph on http://127.0.0.1:2024 for the deep-agents-ui.
# Approval behavior is set in config.yaml (`interrupts:`); email send is always gated.
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

export PATH="$PROJECT_DIR/../cowork_venv/bin:$HOME/.local/bin:$PATH"   # venv python + node
export BROWSER=none

echo "project: $PROJECT_DIR"
echo "node:    $(command -v node) $(node -v 2>/dev/null)"
echo "starting langgraph dev on http://127.0.0.1:2024 ..."
exec ../cowork_venv/bin/langgraph dev --no-browser --host 127.0.0.1 --port 2024
