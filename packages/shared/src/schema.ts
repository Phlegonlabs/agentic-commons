import { z } from 'zod'

const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/

const nonNegativeInt = z.number().int().min(0)

const toolSourceSchema = z.union([z.literal('claude'), z.literal('codex')])
const leaderboardPeriodSchema = z.union([z.literal('24h'), z.literal('7d'), z.literal('all')])

const usageDailySchema = z.object({
  date: z.string().regex(isoDateRegex),
  source: toolSourceSchema,
  model: z.string().min(1).max(128),
  input_uncached: nonNegativeInt,
  output: nonNegativeInt,
  cached_read: nonNegativeInt,
  cached_write: nonNegativeInt,
  total_io: nonNegativeInt,
}).strict()

const socialLinksSchema = z.object({
  twitterUrl: z.string().url().max(200).optional(),
  linkedinUrl: z.string().url().max(200).optional(),
  githubUrl: z.string().url().max(200).optional(),
}).strict()

const profilePatchSchema = z.object({
  handle: z.string().min(3).max(32).regex(/^[a-z0-9_-]+$/).optional(),
  displayName: z.string().min(1).max(64).optional(),
  bio: z.string().max(240).optional(),
  twitterUrl: z.string().url().max(200).optional(),
  linkedinUrl: z.string().url().max(200).optional(),
  githubUrl: z.string().url().max(200).optional(),
  onboardingCompleted: z.boolean().optional(),
}).strict()

const privacyPatchSchema = z.object({
  public: z.boolean(),
}).strict()

type ToolSource = z.infer<typeof toolSourceSchema>
type LeaderboardPeriod = z.infer<typeof leaderboardPeriodSchema>
type UsageDaily = z.infer<typeof usageDailySchema>
type ProfilePatch = z.infer<typeof profilePatchSchema>
type PrivacyPatch = z.infer<typeof privacyPatchSchema>
type SocialLinks = z.infer<typeof socialLinksSchema>

type LeaderboardRow = {
  rank: number
  handle: string
  displayName: string
  total_io: number
  source_count: number
  updated_at: string
}

type PublicProfile = {
  handle: string
  displayName: string
  bio: string
  joinedAt: string
  public: boolean
  social: z.infer<typeof socialLinksSchema>
  isOwnerPreview?: boolean
  totals: {
    total_io: number
    byModel: Record<string, number>
  }
}

export {
  leaderboardPeriodSchema,
  privacyPatchSchema,
  profilePatchSchema,
  socialLinksSchema,
  toolSourceSchema,
  usageDailySchema,
}

export type {
  LeaderboardPeriod,
  LeaderboardRow,
  PrivacyPatch,
  ProfilePatch,
  PublicProfile,
  SocialLinks,
  ToolSource,
  UsageDaily,
}
