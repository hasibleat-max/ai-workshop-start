#!/usr/bin/env bash
# Air cloud startup script for Skill Atlas (Node >= 24 TypeScript CLI, no server).
set -euo pipefail

if [ "${AIR_STARTUP_MODE:-}" = warmup ]; then WARMUP=1; else WARMUP=; fi
cd "$(dirname "$0")/../.."

log() { echo "[startup] $*"; }

# Node >= 24 is required (package.json engines). Install Node 24 via NodeSource only if missing/too old.
node_major() { node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0; }
if [ "$(node_major)" -lt 24 ]; then
  log "Node $(node -v 2>/dev/null || echo none) is too old; installing Node 24"
  curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
log "Using node $(node -v), npm $(npm -v)"

# Install dependencies (npm ci per AGENTS.md); skip if node_modules already matches the lockfile.
if [ ! -d node_modules ] || [ package-lock.json -nt node_modules/.package-lock.json ]; then
  log "Running npm ci"
  npm ci --no-audit --no-fund
  log "npm ci done"
else
  log "node_modules up to date; skipping npm ci"
fi

# Mirrors the CI workflow: typecheck, tests, and the real CLI on the fixture repository.
healthcheck() {
  log "healthcheck: typecheck"
  npm run typecheck
  log "healthcheck: tests"
  npm test
  log "healthcheck: CLI smoke test"
  ./skill-atlas help >/dev/null
  ./skill-atlas scan ./fixture >/dev/null
  log "healthcheck: OK"
}

if [ -n "$WARMUP" ]; then healthcheck; fi
log "startup complete"
