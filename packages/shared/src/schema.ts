import { z } from 'zod'

const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/
const maxTokenFieldValue = 1_000_000_000

const nonNegativeInt = z.number().int().min(0).max(maxTokenFieldValue)

const toolSourceSchema = z.union([z.literal('claude'), z.literal('codex')])

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

type ToolSource = z.infer<typeof toolSourceSchema>
type UsageDaily = z.infer<typeof usageDailySchema>

export {
  toolSourceSchema,
  usageDailySchema,
}

export type {
  ToolSource,
  UsageDaily,
}
