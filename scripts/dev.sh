#!/bin/sh
set -eu
cd "$(dirname "$0")/.."

# Use ordinary Node/pnpm installations first, or Codex's bundled runtime on this Mac.
chassix_runtime="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies"
if ! command -v node >/dev/null 2>&1 && [ -x "$chassix_runtime/node/bin/node" ]; then
  PATH="$chassix_runtime/node/bin:$PATH"
  export PATH
fi
if ! command -v pnpm >/dev/null 2>&1 && [ -x "$chassix_runtime/bin/fallback/pnpm" ]; then
  PATH="$chassix_runtime/bin/fallback:$PATH"
  export PATH
fi
if ! command -v node >/dev/null 2>&1 || ! command -v pnpm >/dev/null 2>&1; then
  printf '%s\n' 'Install a Node.js version supported by Vite and pnpm, then run this script again.'
  exit 1
fi
if [ ! -d apps/web/node_modules ]; then
  pnpm install --frozen-lockfile
fi
exec pnpm dev
