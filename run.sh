#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

GREEN='\033[0;32m'; BLUE='\033[0;34m'; YELLOW='\033[1;33m'; NC='\033[0m'
die() { echo -e "${YELLOW}Warning:${NC} $*"; exit 1; }

echo -e "${BLUE}╔══════════════════════════════════════╗${NC}"
echo -e "${BLUE}║        Sahayak — AI Workspace        ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════╝${NC}"

# ── Parse flags ──────────────────────────────────────────
NO_VOICE=false; PORT=9090
while [[ $# -gt 0 ]]; do case "$1" in
  --no-voice) NO_VOICE=true; shift ;;
  --port) PORT="$2"; shift 2 ;;
  --help|-h) echo "Usage: $0 [--no-voice] [--port PORT]"; exit 0 ;;
  *) die "Unknown option: $1" ;;
esac; done

# ── Kill stale processes on the target port ────────────
if lsof -i :"$PORT" >/dev/null 2>&1; then
  echo -e "${YELLOW}Port $PORT is in use — killing existing process...${NC}"
  lsof -ti :"$PORT" | xargs kill -9 2>/dev/null || true
  sleep 1
fi

# ── Kill stale voice servers ────────────────────────────
pkill -f "voiceserver.*main.py" 2>/dev/null || true
sleep 1

# ── Detect Python for sidecar ──────────────────────────
if [ "$NO_VOICE" = false ]; then
  for p in "$SCRIPT_DIR/voiceserver/.venv/bin/python3" \
           "$(command -v python3.11 2>/dev/null || true)" \
           "$(command -v python3.12 2>/dev/null || true)" \
           "$(command -v python3 2>/dev/null || true)"; do
    if [ -n "$p" ] && [ -x "$p" ]; then
      export SAHAYAK_VOICESERVER_PYTHON="$p"
      echo -e "${GREEN}Voice: ${SAHAYAK_VOICESERVER_PYTHON}${NC}"
      break
    fi
  done
  if [ -z "${SAHAYAK_VOICESERVER_PYTHON:-}" ]; then
    echo -e "${YELLOW}No Python found — voice disabled. Pass --no-voice to silence.${NC}"
    NO_VOICE=true
  fi
fi

# ── Build ──────────────────────────────────────────────
echo -e "${YELLOW}Building packages...${NC}"
pnpm --filter @sahayak/shared build
pnpm --filter @sahayak/ui build
pnpm --filter @sahayak/server build

# ── Start everything ──────────────────────────────────
echo -e "${GREEN}Starting Sahayak on http://localhost:${PORT}...${NC}"
export SAHAYAK_AI_ENDPOINT="${SAHAYAK_AI_ENDPOINT:-http://localhost:8080}"
export SAHAYAK_VAULT_PATH="${SAHAYAK_VAULT_PATH:-$HOME/sahayak-vault}"
export SAHAYAK_SKILLS_DIR="${SAHAYAK_SKILLS_DIR:-$SCRIPT_DIR/skills}"

exec node packages/server/dist/cli.js \
  --port "$PORT" \
  ${NO_VOICE:+--no-voice} \
  --vault-path "$SAHAYAK_VAULT_PATH" \
  --skills-dir "$SAHAYAK_SKILLS_DIR"
