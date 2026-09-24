import { z } from 'zod'
import { CRAWL_MODES, KEEP_KINDS } from './recipe-kind.enum'
import type { CrawlMode, KeepKind } from './recipe-kind.enum'
import { errorPolicySchema, stepSchema } from './step.contract'
import type { ErrorPolicy, Step } from './step.contract'
import { mappingRuleSchema } from './transform-rule.contract'
import type { MappingRule } from './transform-rule.contract'

/** A URL the crawl starts from, with variables visible to its templates as `vars.*`. */
export interface StartPoint {
  url:   string
  vars?: Record<string, string | number | boolean>
}

/** A cookie in Playwright's shape. */
export interface RecipeCookie {
  name:      string
  value:     string
  domain:    string
  path?:     string
  expires?:  number
  httpOnly?: boolean
  secure?:   boolean
  sameSite?: 'Strict' | 'Lax' | 'None'
}

/** Runs before the crawl, always in a browser, to obtain cookies or storage (a login, a consent wall). */
export interface SessionBootstrap {
  steps:   Step[]
  keep:    KeepKind[]
  /** Persist the resulting storage state for the next run. */
  saveTo?: string
}

export interface SessionSpec {
  headers?:          Record<string, string>
  cookies?:          RecipeCookie[]
  userAgent?:        string
  viewport?:         { width: number, height: number }
  /** Reuse a storage state saved by a previous bootstrap. */
  storageStatePath?: string
  bootstrap?:        SessionBootstrap
}

export interface CrawlLimits {
  maxRecords?:  number
  /** Waited before every `goto` and every `request`. */
  delayMs?:     number
  timeoutMs?:   number
  /** Reserved; v1 runs everything sequentially. */
  concurrency?: 1
}

/** Where to start, how to navigate, what to extract, and how it maps to one output recipe. */
export interface InputRecipe {
  $schema?:     string
  kind:         'input'
  id:           string
  /** The `OutputRecipe.id` this recipe feeds. */
  output:       string
  mode:         CrawlMode
  description?: string
  start:        StartPoint[]
  vars?:        Record<string, string | number | boolean>
  session?:     SessionSpec
  limits?:      CrawlLimits
  /** Default policy for every step. */
  onError?:     ErrorPolicy
  steps:        Step[]
  /** Keyed by output field path, dotted for nested fields. */
  mapping:      Record<string, MappingRule>
}

const scalar = z.union([z.string(), z.number(), z.boolean()])
const vars = z.record(z.string().regex(/^[A-Z_]\w*$/i), scalar)

export const startPointSchema: z.ZodType<StartPoint> = z.strictObject({ url: z.string().min(1), vars: vars.optional() })

const cookieSchema: z.ZodType<RecipeCookie> = z.strictObject({
  name:     z.string().min(1),
  value:    z.string(),
  domain:   z.string().min(1),
  path:     z.string().optional(),
  expires:  z.number().optional(),
  httpOnly: z.boolean().optional(),
  secure:   z.boolean().optional(),
  sameSite: z.enum(['Strict', 'Lax', 'None']).optional(),
})

const bootstrapSchema: z.ZodType<SessionBootstrap> = z.strictObject({
  steps:  z.array(stepSchema).min(1),
  keep:   z.array(z.enum(KEEP_KINDS)).min(1),
  saveTo: z.string().optional(),
})

export const sessionSpecSchema: z.ZodType<SessionSpec> = z.strictObject({
  headers:          z.record(z.string(), z.string()).optional(),
  cookies:          z.array(cookieSchema).optional(),
  userAgent:        z.string().optional(),
  viewport:         z.strictObject({ width: z.int().positive(), height: z.int().positive() }).optional(),
  storageStatePath: z.string().optional(),
  bootstrap:        bootstrapSchema.optional(),
})

const limitsSchema: z.ZodType<CrawlLimits> = z.strictObject({
  maxRecords:  z.int().positive().optional(),
  delayMs:     z.int().nonnegative().optional(),
  timeoutMs:   z.int().positive().optional(),
  concurrency: z.literal(1).optional(),
})

export const inputRecipeSchema: z.ZodType<InputRecipe> = z.strictObject({
  $schema:     z.string().optional(),
  kind:        z.literal('input'),
  id:          z.string().regex(/^[a-z0-9][a-z0-9-]*$/, 'an id is lowercase letters, digits and hyphens'),
  output:      z.string().min(1),
  mode:        z.enum(CRAWL_MODES),
  description: z.string().optional(),
  start:       z.array(startPointSchema).min(1),
  vars:        vars.optional(),
  session:     sessionSpecSchema.optional(),
  limits:      limitsSchema.optional(),
  onError:     errorPolicySchema.optional(),
  steps:       z.array(stepSchema).min(1),
  mapping:     z.record(z.string().min(1), mappingRuleSchema),
})
