#!/usr/bin/env bash
set -e

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

echo "==> apps/ai-audio-service (venv + pip)"
cd apps/ai-audio-service
if [ ! -d .venv ]; then
  python3 -m venv .venv
  echo "    created .venv"
fi
source .venv/bin/activate
pip install -r requirements.txt
deactivate 2>/dev/null || true
cd "$ROOT"

echo "==> apps/media-service (pnpm)"
cd apps/media-service
pnpm install
cd "$ROOT"

echo "==> apps/web (pnpm)"
cd apps/web
pnpm install
cd "$ROOT"

echo "Done. All dependencies installed."
