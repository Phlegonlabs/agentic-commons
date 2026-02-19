import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { homedir, platform } from 'node:os'
import { join } from 'node:path'
import type { ToolProbeResult, UnknownToolHint } from '../types.js'

const home = homedir()
const isWin = platform() === 'win32'

// Model reading strategy per config format
type ModelReader =
  | { format: 'toml-key'; key: string }
  | { format: 'json-key'; key: string }

type ToolDef = {
  name: string
  slug: string
  dir: string
  win32Dir: string | null
  configFile: string | null
  binary: string | null
  provider: string
  apiKeyEnvVar: string | null
  modelReader: ModelReader | null
}

const TOOLS: ToolDef[] = [
  {
    name: 'Claude Code', slug: 'claude',
    dir: '.claude', win32Dir: null,
    configFile: 'settings.json', binary: 'claude',
    provider: 'anthropic', apiKeyEnvVar: 'ANTHROPIC_API_KEY',
    modelReader: null,
  },
  {
    name: 'Codex CLI', slug: 'codex',
    dir: '.codex', win32Dir: null,
    configFile: 'config.toml', binary: 'codex',
    provider: 'openai', apiKeyEnvVar: 'OPENAI_API_KEY',
    modelReader: { format: 'toml-key', key: 'model' },
  },
  {
    name: 'Gemini CLI', slug: 'gemini',
    dir: '.gemini', win32Dir: null,
    configFile: 'GEMINI.md', binary: 'gemini',
    provider: 'google', apiKeyEnvVar: 'GEMINI_API_KEY',
    modelReader: null,
  },
  {
    name: 'Kimi CLI', slug: 'kimi',
    dir: '.kimi', win32Dir: null,
    configFile: 'config.toml', binary: 'kimi',
    provider: 'moonshot', apiKeyEnvVar: 'KIMI_API_KEY',
    modelReader: { format: 'toml-key', key: 'model' },
  },
  {
    name: 'OpenCode', slug: 'opencode',
    dir: '.opencode', win32Dir: 'AppData/Roaming/opencode',
    configFile: 'antigravity-accounts.json', binary: 'opencode',
    provider: 'various', apiKeyEnvVar: null,
    modelReader: null,
  },
  {
    name: 'Cursor', slug: 'cursor',
    dir: '.cursor', win32Dir: 'AppData/Roaming/Cursor/User',
    configFile: null, binary: 'cursor',
    provider: 'various', apiKeyEnvVar: null,
    modelReader: null,
  },
  {
    name: 'Windsurf', slug: 'windsurf',
    dir: '.codeium', win32Dir: 'AppData/Local/Windsurf',
    configFile: null, binary: 'windsurf',
    provider: 'codeium', apiKeyEnvVar: null,
    modelReader: null,
  },
  {
    name: 'Aider', slug: 'aider',
    dir: '.aider', win32Dir: null,
    configFile: '.aider.conf.yml', binary: 'aider',
    provider: 'various', apiKeyEnvVar: 'OPENAI_API_KEY',
    modelReader: null,
  },
  {
    name: 'Goose', slug: 'goose',
    dir: '.config/goose', win32Dir: null,
    configFile: 'config.yaml', binary: 'goose',
    provider: 'various', apiKeyEnvVar: null,
    modelReader: null,
  },
  {
    name: 'Amp', slug: 'amp',
    dir: '.config/amp', win32Dir: null,
    configFile: null, binary: 'amp',
    provider: 'sourcegraph', apiKeyEnvVar: null,
    modelReader: null,
  },
  {
    name: 'Crush', slug: 'crush',
    dir: '.config/crush', win32Dir: null,
    configFile: null, binary: 'crush',
    provider: 'various', apiKeyEnvVar: null,
    modelReader: null,
  },
  {
    name: 'Droid', slug: 'droid',
    dir: '.factory', win32Dir: null,
    configFile: 'settings.json', binary: 'droid',
    provider: 'factory', apiKeyEnvVar: null,
    modelReader: null,
  },
  {
    name: 'Kiro', slug: 'kiro',
    dir: '.kiro', win32Dir: null,
    configFile: null, binary: 'kiro-cli',
    provider: 'aws', apiKeyEnvVar: null,
    modelReader: null,
  },
  {
    name: 'Auggie', slug: 'auggie',
    dir: '.config/auggie', win32Dir: null,
    configFile: null, binary: 'auggie',
    provider: 'augment', apiKeyEnvVar: null,
    modelReader: null,
  },
  {
    name: 'Copilot CLI', slug: 'copilot-cli',
    dir: '.copilot', win32Dir: null,
    configFile: null, binary: 'copilot',
    provider: 'github', apiKeyEnvVar: null,
    modelReader: null,
  },
  {
    name: 'Cody', slug: 'cody',
    dir: '.config/sourcegraph', win32Dir: null,
    configFile: null, binary: 'cody',
    provider: 'sourcegraph', apiKeyEnvVar: null,
    modelReader: null,
  },
  {
    name: 'Qwen-Code', slug: 'qwen-code',
    dir: '.qwen', win32Dir: null,
    configFile: 'settings.json', binary: 'qwen-code',
    provider: 'alibaba', apiKeyEnvVar: null,
    modelReader: null,
  },
  {
    name: 'KiloCode', slug: 'kilocode',
    dir: '.config/kilocode', win32Dir: null,
    configFile: null, binary: 'kilo',
    provider: 'various', apiKeyEnvVar: null,
    modelReader: null,
  },
  {
    name: 'AIChat', slug: 'aichat',
    dir: '.config/aichat', win32Dir: null,
    configFile: null, binary: 'aichat',
    provider: 'various', apiKeyEnvVar: null,
    modelReader: null,
  },
]

function resolveDir(def: ToolDef): string {
  const rel = (isWin && def.win32Dir) ? def.win32Dir : def.dir
  return join(home, rel)
}

function checkBinary(name: string): boolean {
  try {
    execFileSync(isWin ? 'where' : 'which', [name], { stdio: 'pipe' })
    return true
  } catch {
    return false
  }
}

function maskKey(key: string): string {
  if (key.length <= 10) return '***'
  return key.slice(0, 6) + '...' + key.slice(-4)
}

function readEnvKey(envVar: string | null): { status: 'set' | 'not_set' | 'n/a'; masked: string | null } {
  if (!envVar) return { status: 'n/a', masked: null }
  const val = process.env[envVar]
  if (!val) return { status: 'not_set', masked: null }
  return { status: 'set', masked: maskKey(val) }
}

function readModelFromConfig(dir: string, reader: ModelReader | null): string | null {
  if (!reader) return null
  try {
    const path = reader.format === 'toml-key'
      ? join(dir, 'config.toml')
      : join(dir, 'settings.json')
    const raw = readFileSync(path, 'utf-8')
    if (reader.format === 'toml-key') {
      const match = raw.match(new RegExp(`^${reader.key}\\s*=\\s*"(.+)"`, 'm'))
      return match?.[1] ?? null
    }
    const json = JSON.parse(raw) as Record<string, unknown>
    return (json[reader.key] as string) ?? null
  } catch {
    return null
  }
}

function probeOne(def: ToolDef): ToolProbeResult {
  const dir = resolveDir(def)
  const dirExists = existsSync(dir)
  const configFound = def.configFile
    ? existsSync(join(dir, def.configFile))
    : false
  const binaryOnPath = def.binary ? checkBinary(def.binary) : false
  const { status: apiKeyStatus, masked: apiKeyMasked } = readEnvKey(def.apiKeyEnvVar)
  const model = readModelFromConfig(dir, def.modelReader)
  const detected = dirExists || binaryOnPath

  return {
    name: def.name,
    slug: def.slug,
    status: detected ? 'detected' : 'not_found',
    installDir: dirExists ? dir : null,
    configFound,
    binaryOnPath,
    provider: def.provider,
    apiKeyEnvVar: def.apiKeyEnvVar,
    apiKeyStatus,
    apiKeyMasked,
    model,
  }
}

export function probeAll(): ToolProbeResult[] {
  return TOOLS.map(probeOne)
}

const AI_SIGNALS = ['mcp.json', 'mcp_config.json', 'AGENTS.md', 'agents', 'skills']

const EXCLUDED_DIRS = new Set([
  '.git', '.ssh', '.npm', '.cargo', '.rustup', '.docker',
  '.vscode', '.config/nvim', '.local', '.cache', '.nvm',
  '.gradle', '.m2', '.gnupg', '.pki', '.dbus',
  ...TOOLS.map(t => t.dir),
])

function scanForSignals(dir: string): string | null {
  for (const sig of AI_SIGNALS) {
    if (existsSync(join(dir, sig))) return sig
  }
  return null
}

function scanDotdirs(base: string, prefix: string): UnknownToolHint[] {
  const hints: UnknownToolHint[] = []
  try {
    const entries = readdirSync(base, { withFileTypes: true })
    for (const e of entries) {
      if (!e.isDirectory()) continue
      const rel = prefix ? `${prefix}/${e.name}` : e.name
      if (EXCLUDED_DIRS.has(rel)) continue
      const signal = scanForSignals(join(base, e.name))
      if (signal) hints.push({ dir: rel, signal })
    }
  } catch {
    // directory not readable
  }
  return hints
}

export function discoverUnknown(): UnknownToolHint[] {
  const dotdirs = scanDotdirs(home, '').filter(h => h.dir.startsWith('.'))
  const configDirs = scanDotdirs(join(home, '.config'), '.config')
  return [...dotdirs, ...configDirs]
}
