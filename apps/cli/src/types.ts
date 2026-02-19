// === Tool sources ===

type ToolSource = 'claude' | 'codex'

// === Claude stats-cache.json structures ===

type ClaudeDailyActivity = {
  date: string
  messageCount: number
  sessionCount: number
  toolCallCount: number
}

type ClaudeDailyModelTokens = {
  date: string
  tokensByModel: Record<string, number>
}

type ClaudeModelUsage = {
  inputTokens: number
  outputTokens: number
  cacheReadInputTokens: number
  cacheCreationInputTokens: number
  webSearchRequests: number
  costUSD: number
  contextWindow: number
  maxOutputTokens: number
}

type ClaudeStatsCache = {
  version: number
  lastComputedDate: string
  dailyActivity: ClaudeDailyActivity[]
  dailyModelTokens: ClaudeDailyModelTokens[]
  modelUsage: Record<string, ClaudeModelUsage>
  totalSessions: number
  totalMessages: number
  longestSession: {
    sessionId: string
    duration: number
    messageCount: number
    timestamp: string
  }
  firstSessionDate: string
  hourCounts: Record<string, number>
}

// === Codex JSONL structures ===

type CodexSessionMeta = {
  id: string
  timestamp: string
  cwd: string
  model_provider: string
  cli_version: string
}

type CodexTokenUsage = {
  input_tokens: number
  cached_input_tokens: number
  output_tokens: number
  reasoning_output_tokens: number
  total_tokens: number
}

type CodexRateLimitPrimary = {
  used_percent: number
  window_minutes: number
  resets_at: number
}

type CodexTokenEvent = {
  timestamp: string
  type: 'event_msg'
  payload: {
    type: 'token_count'
    info: {
      total_token_usage: CodexTokenUsage
      last_token_usage: CodexTokenUsage
      model_context_window: number
    }
    rate_limits: {
      limit_id: string
      limit_name: string | null
      primary: CodexRateLimitPrimary | null
      secondary: CodexRateLimitPrimary | null
      credits: {
        has_credits: boolean
        unlimited: boolean
        balance: number | null
      }
      plan_type: string | null
    }
  }
}

// === Unified output types ===

type DailyTokens = {
  date: string
  source: ToolSource
  model: string
  inputTokens: number
  outputTokens: number
  cachedTokens: number
  reasoningTokens: number
  totalTokens: number
}

type DailySummary = {
  date: string
  source: ToolSource
  sessions: number
  messages: number
  toolCalls: number
  totalTokens: number
}

type RateLimit = {
  name: string
  usedPercent: number
  windowMinutes: number
  resetsAt: number
}

type CodexRateStatus = {
  limits: RateLimit[]
  credits: { hasCredits: boolean; unlimited: boolean; balance: number | null }
  timestamp: string
}

// === Storage types ===

type CodexSessionData = {
  sessionId: string
  date: string
  timestamp: string
  totalTokens: CodexTokenUsage
  rateLimits: CodexTokenEvent['payload']['rate_limits'] | null
}

type UsageStore = {
  version: number
  lastSync: string
  claude: {
    stats: ClaudeStatsCache | null
  }
  codex: {
    sessions: CodexSessionData[]
  }
}

type SetupConfig = {
  version: number
  claudeHookInstalled: boolean
  schedulerInstalled: boolean
  schedulerType: 'schtasks' | 'launchd' | 'crontab' | null
  lastSetup: string
  apiBase?: string
  apiToken?: string
  linkedAt?: string
  deviceLabel?: string
  autoUpdateEnabled?: boolean
  lastAutoUpdateCheck?: string
  lastAutoUpdateVersion?: string
}

export type {
  ToolSource,
  ClaudeDailyActivity,
  ClaudeDailyModelTokens,
  ClaudeModelUsage,
  ClaudeStatsCache,
  CodexSessionMeta,
  CodexTokenUsage,
  CodexRateLimitPrimary,
  CodexTokenEvent,
  DailyTokens,
  DailySummary,
  RateLimit,
  CodexRateStatus,
  CodexSessionData,
  UsageStore,
  SetupConfig,
}
