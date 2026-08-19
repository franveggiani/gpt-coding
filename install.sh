#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
VSCODE_DIR="$ROOT_DIR/vscode-extension"
BROWSER_DIR="$ROOT_DIR/browser-extension"

fail() {
  printf '\n[ERROR] %s\n' "$1" >&2
  exit 1
}

require_command() {
  local command_name="$1"
  local install_hint="$2"

  if ! command -v "$command_name" >/dev/null 2>&1; then
    fail "Required command '$command_name' was not found. $install_hint"
  fi
}

printf '%s\n' '========================================'
printf '%s\n' ' GPT Coding installer'
printf '%s\n' '========================================'
printf '\nChecking prerequisites...\n'

require_command git "Install Git and make sure it is available in PATH."
require_command node "Install Node.js 20 or newer."
require_command npm "Install npm (normally included with Node.js)."
require_command code "Install VS Code and enable the 'code' command in PATH."

NODE_MAJOR="$(node -p 'Number(process.versions.node.split(".")[0])')"
if [[ "$NODE_MAJOR" -lt 20 ]]; then
  fail "Node.js 20 or newer is required. Detected: $(node --version)"
fi

[[ -f "$VSCODE_DIR/package.json" ]] || fail "Missing $VSCODE_DIR/package.json"
[[ -f "$BROWSER_DIR/manifest.json" ]] || fail "Missing $BROWSER_DIR/manifest.json"

printf '[OK] Git: %s\n' "$(git --version)"
printf '[OK] Node.js: %s\n' "$(node --version)"
printf '[OK] npm: %s\n' "$(npm --version)"
printf '[OK] VS Code CLI: %s\n' "$(code --version | sed -n '1p')"

printf '\nInstalling VS Code extension dependencies...\n'
cd "$VSCODE_DIR"
npm install

printf '\nBuilding and packaging VS Code extension...\n'
rm -f -- gpt-coding-*.vsix
npm run package:vsix

PACKAGE_NAME="$(node -p "require('./package.json').name")"
PACKAGE_VERSION="$(node -p "require('./package.json').version")"
VSIX_PATH="$VSCODE_DIR/${PACKAGE_NAME}-${PACKAGE_VERSION}.vsix"

[[ -f "$VSIX_PATH" ]] || fail "Expected VSIX was not generated: $VSIX_PATH"

printf '\nInstalling VS Code extension...\n'
code --install-extension "$VSIX_PATH" --force

printf '\n[OK] VS Code extension installed: %s\n' "$VSIX_PATH"
printf '[OK] Browser extension ready: %s\n' "$BROWSER_DIR"

printf '\n========================================\n'
printf '%s\n' ' MANUAL CHROME SETUP'
printf '%s\n' '========================================'
printf '%s\n' 'The VS Code extension is installed. Chrome requires one manual step to load the local browser extension.'
printf '\n1. Open Chrome.\n'
printf '2. Go to: chrome://extensions\n'
printf '3. Enable "Developer mode" in the top-right corner.\n'
printf '4. Click "Load unpacked".\n'
printf '5. Select this exact folder:\n\n'
printf '   %s\n\n' "$BROWSER_DIR"
printf '6. Confirm that "GPT Coding Prompt Bridge" appears enabled.\n'
printf '7. Keep the extension enabled while using GPT Coding.\n'
printf '\nIMPORTANT: GPT Coding only inserts the prepared prompt. Review it and press Send in ChatGPT manually.\n'
printf '\nInstallation finished.\n'
