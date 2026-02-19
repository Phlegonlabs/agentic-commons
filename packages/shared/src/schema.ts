import { z } from 'zod'

const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/
const maxTokenFieldValue = 1_000_000_000
const sourceNameRegex = /^[a-z0-9][a-z0-9_-]{0,63}$/
const providerNameRegex = /^[a-z0-9][a-z0-9._-]{0,63}$/

const nonNegativeInt = z.number().int().min(0).max(maxTokenFieldValue)

const toolSourceSchema = z.string().regex(sourceNameRegex).min(1).max(64)
const toolProviderSchema = z.string().regex(providerNameRegex).min(1).max(64)

const usageDailySchema = z.object({
  date: z.string().regex(isoDateRegex),
  source: toolSourceSchema,
  provider: toolProviderSchema.default('unknown'),
  model: z.string().min(1).max(128),
  input_uncached: nonNegativeInt,
  output: nonNegativeInt,
  cached_read: nonNegativeInt,
  cached_write: nonNegativeInt,
  total_io: nonNegativeInt,
}).strict()

type ToolSource = z.infer<typeof toolSourceSchema>
type ToolProvider = z.infer<typeof toolProviderSchema>
type UsageDaily = z.infer<typeof usageDailySchema>

export {
  toolProviderSchema,
  toolSourceSchema,
  usageDailySchema,
}

export type {
  ToolProvider,
  ToolSource,
  UsageDaily,
}
