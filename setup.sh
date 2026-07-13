#!/usr/bin/env bash
# One-command setup for macOS / Linux (including WSL).
# Installs the correct Node.js version (via nvm) if needed, then installs
# all dependencies with the committed lockfile.
#
# Usage:
#   chmod +x setup.sh
#   ./setup.sh
set -euo pipefail

REQUIRED_MAJOR=20
cd "$(dirname "$0")"

echo "== Proof of Dev setup =="

# ─── 1. Ensure Node.js is installed and on the right major version ──────────
node_ok() {
  command -v node >/dev/null 2>&1 || return 1
  local major
  major="$(node -v | sed 's/^v//' | cut -d. -f1)"
  [ "$major" -ge "$REQUIRED_MAJOR" ] && [ "$major" -lt 23 ]
}

if node_ok; then
  echo "Node $(node -v) found — OK"
else
  echo "Node.js >=20 <23 not found. Installing via nvm..."
  export NVM_DIR="$HOME/.nvm"
  if [ ! -s "$NVM_DIR/nvm.sh" ]; then
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
  fi
  # shellcheck disable=SC1090
  \. "$NVM_DIR/nvm.sh"
  nvm install 20
  nvm use 20
fi

echo "Node: $(node -v)   npm: $(npm -v)"

# ─── 2. Create .env.local if it doesn't exist yet ────────────────────────────
if [ ! -f .env.local ] && [ -f .env.example ]; then
  cp .env.example .env.local
  echo "Created .env.local from .env.example (demo mode by default)."
fi

# ─── 3. Install dependencies from the committed lockfile ────────────────────
echo "Installing dependencies (npm ci)..."
npm ci

echo
echo "Setup complete. Start the app with:"
echo "  npm run dev"
echo
echo "This runs the analysis API (:8000), the ZeroMQ worker, and Next.js (:3000)."
echo "MongoDB is optional in demo mode — install/run it locally, or use"
echo "'docker compose up' instead, to persist results."
