#!/usr/bin/env bash
set -euo pipefail

AC_DIR="$HOME/.agentic-commons"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# --- 1. Create data directory ---
mkdir -p "$AC_DIR"
chmod 700 "$AC_DIR"
echo "[acommons] Created $AC_DIR"

# --- 2. Copy scripts ---
cp "$SCRIPT_DIR/hook.mjs" "$AC_DIR/hook.mjs"
cp "$SCRIPT_DIR/collect.mjs" "$AC_DIR/collect.mjs"
echo "[acommons] Copied hook.mjs and collect.mjs to $AC_DIR"

# --- 3. Install Claude Code Stop Hook ---
CLAUDE_SETTINGS="$HOME/.claude/settings.json"

install_claude_hook() {
  mkdir -p "$HOME/.claude"

  node -e "
    const fs = require('fs');
    const settingsPath = '$CLAUDE_SETTINGS';
    const hookCmd = 'node $AC_DIR/hook.mjs';

    let settings = {};
    try { settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8')); } catch {}

    if (!settings.hooks) settings.hooks = {};
    const stops = Array.isArray(settings.hooks.Stop) ? settings.hooks.Stop : [];

    const hasHook = stops.some(entry =>
      Array.isArray(entry.hooks) && entry.hooks.some(h => h.type === 'command' && h.command === hookCmd)
    );

    if (hasHook) {
      console.log('[acommons] Claude Code Stop hook already installed');
      process.exit(0);
    }

    // Normalize legacy flat entries into matcher format
    const normalized = stops.map(entry => {
      if (entry.type === 'command' && entry.command) {
        return { hooks: [{ type: 'command', command: entry.command }] };
      }
      return entry;
    });
    normalized.push({ hooks: [{ type: 'command', command: hookCmd }] });
    settings.hooks.Stop = normalized;
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
    console.log('[acommons] Claude Code Stop hook installed');
  "
}

install_claude_hook

# --- 4. Install OS-level hourly scheduler ---

install_launchd() {
  local plist="$HOME/Library/LaunchAgents/com.agentic-commons.plist"
  local log="$AC_DIR/collect.log"
  mkdir -p "$HOME/Library/LaunchAgents"

  cat > "$plist" << PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.agentic-commons</string>
  <key>ProgramArguments</key><array><string>node</string><string>$AC_DIR/collect.mjs</string></array>
  <key>StartInterval</key><integer>3600</integer>
  <key>RunAtLoad</key><true/>
  <key>StandardOutPath</key><string>$log</string>
  <key>StandardErrorPath</key><string>$log</string>
  <key>ProcessType</key><string>Background</string>
</dict>
</plist>
PLIST

  launchctl unload "$plist" 2>/dev/null || true
  if launchctl load "$plist"; then
    echo "[acommons] macOS LaunchAgent installed (hourly)"
  else
    echo "[acommons] Failed to load LaunchAgent. Try: launchctl load \"$plist\""
  fi
}

install_crontab() {
  local current
  current=$(crontab -l 2>/dev/null || true)
  if echo "$current" | grep -q "collect.mjs"; then
    echo "[acommons] Crontab entry already exists"
    return
  fi
  echo "$current
0 * * * * node $AC_DIR/collect.mjs >> $AC_DIR/collect.log 2>&1" | crontab -
  echo "[acommons] Crontab entry added (hourly)"
}

install_schtasks() {
  local vbs="$AC_DIR/collect.vbs"
  local win_vbs win_node win_collect
  win_vbs=$(cygpath -w "$vbs" 2>/dev/null || echo "$vbs")
  win_node=$(cygpath -w "$(which node)" 2>/dev/null || which node)
  win_collect=$(cygpath -w "$AC_DIR/collect.mjs" 2>/dev/null || echo "$AC_DIR/collect.mjs")

  cat > "$vbs" << VBS
CreateObject("WScript.Shell").Run """$win_node"" ""$win_collect""", 0, True
VBS

  if schtasks //create //tn "AgenticCommons" //tr "wscript.exe \"$win_vbs\"" //sc hourly //f > /dev/null 2>&1; then
    echo "[acommons] Windows scheduled task created (hourly, background)"
  else
    echo "[acommons] Failed to create scheduled task (may need admin privileges)"
  fi
}

case "$(uname -s)" in
  Darwin)       install_launchd  ;;
  Linux)        install_crontab  ;;
  MINGW*|MSYS*|CYGWIN*) install_schtasks ;;
  *)            echo "[acommons] Unknown OS: $(uname -s) — skipping scheduler" ;;
esac

# --- Done ---
echo ""
echo "[acommons] Setup complete!"
echo "  Hook:      node $AC_DIR/hook.mjs"
echo "  Scheduler: node $AC_DIR/collect.mjs (hourly)"
echo ""
echo "  Next: run 'acommons link' to connect your account"
