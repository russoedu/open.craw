import { z } from 'zod'
import { CRAWL_MODES, KEEP_KINDS } from './recipe-kind.enum'
import type { CrawlMode, KeepKind } from './recipe-kind.enum'
import { captchaCheckSchema, errorPolicySchema, stepSchema } from './step.contract'
import type { CaptchaCheck, ErrorPolicy, Step } from './step.contract'
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

/**
 * What the site needs from the network, never how to get it: the runner's
 * access config maps a profile name to a provider and credentials.
 */
export interface SessionAccess {
  /** An access profile of the runner's config; its default when omitted. */
  profile?: string
  /** ISO 3166 country the traffic should come from, for profiles that target by country. */
  country?: string
  /** `false` lets the provider rotate IPs per request; the profile decides when omitted. */
  sticky?:  boolean
}

/**
 * What counts as the site refusing the crawl, checked on every navigation and
 * request. Any condition that matches is a block. When omitted: status 403 or
 * 429, or an AWS WAF challenge (`x-amzn-waf-action: challenge`).
 */
export interface BlockRule {
  status?: number[]
  /** Header name to a regular expression its value must match (case-insensitive). */
  header?: Record<string, string>
  /** A regular expression the response body must match (case-insensitive). */
  text?:   string
}

/**
 * What to do when blocked. `solve`: when the block page shows a captcha, the
 * `session.captcha` solver solves it on the spot. `rotate`: take a new access
 * lease (a new IP), reopen the session, and retry the step; with `solve`, only
 * once solving failed.
 */
export interface BlockRotation {
  rotate?:   boolean
  solve?:    boolean
  /** How many rotations a recipe run may use. Default 2. */
  attempts?: number
}

/**
 * How a web recipe gets past captchas: a solver the runner registered (a
 * plugin's `captchaSolvers`), where to look for challenges, how to confirm
 * one is solved, and what the run may spend. With it, the engine checks for a
 * challenge after each navigation, click and key press, and solves it before
 * the next step runs.
 */
export interface CaptchaSettings {
  /** The name of a registered captcha solver. */
  solver:     string
  /** Where challenges are (a Playwright selector); the common widgets when omitted. */
  detect?:    { selector: string }
  /** How a solve is confirmed. Default: the challenge is gone. */
  verify?:    CaptchaCheck
  /** Solves tried per challenge before it counts as a block. Default 3. */
  attempts?:  number
  /** How long one solve may take. Default 120000. */
  timeoutMs?: number
  /** Solves the whole run may spend (a paid solver bills each). Default 10; 0 detects without solving. */
  maxSolves?: number
}

export interface SessionSpec {
  headers?:          Record<string, string>
  cookies?:          RecipeCookie[]
  userAgent?:        string
  viewport?:         { width: number, height: number }
  /** Reuse a storage state saved by a previous bootstrap. */
  storageStatePath?: string
  bootstrap?:        SessionBootstrap
  access?:           SessionAccess
  blockedWhen?:      BlockRule
  onBlock?:          BlockRotation
  captcha?:          CaptchaSettings
  /**
   * A browser profile of the runner that persists between runs (cookies,
   * storage, cache): web recipes and bootstraps run in it. A name; the runner
   * decides where profiles live.
   */
  browserProfile?:   string
}

/**
 * How a request that fails in passing (a dropped connection, a timeout, a
 * 503, a 429) is sent again. On by default: three tries in all.
 */
export interface RetryRule {
  /** Tries per request, the first included; `1` turns retrying off. Default 3. */
  attempts?:   number
  /** The first pause; it doubles on every retry. Default 1000. */
  backoffMs?:  number
  /** The longest pause, `Retry-After` included; a server asking for longer is not retried. Default 30000. */
  maxDelayMs?: number
  /** The statuses retried. Default `[408, 425, 429, 500, 502, 503, 504]`. */
  statuses?:   number[]
}

export interface CrawlLimits {
  maxRecords?:  number
  /** Minimum interval between two request starts across the recipe, whatever runs in parallel. */
  delayMs?:     number
  timeoutMs?:   number
  /** How many `forEach` iterations may run at once (api mode; a web recipe drives one page). Default 1. */
  concurrency?: number
  /** How requests that fail in passing are sent again; the crawler's `retry`, else three tries, when omitted. */
  retry?:       RetryRule
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

const sessionAccessSchema: z.ZodType<SessionAccess> = z.strictObject({
  profile: z.string().regex(/^[\w-]+$/, 'a profile name is letters, digits, hyphens and underscores').optional(),
  country: z.string().regex(/^[A-Z]{2}$/i, 'a country is a two-letter ISO code').optional(),
  sticky:  z.boolean().optional(),
})

const regexSource = z.string().min(1).refine((source) => {
  try {
    return new RegExp(source, 'i').source.length > 0
  } catch {
    return false
  }
}, 'not a valid regular expression')

const blockRuleSchema: z.ZodType<BlockRule> = z.strictObject({
  status: z.array(z.int().min(100).max(599)).optional(),
  header: z.record(z.string().min(1), regexSource).optional(),
  text:   regexSource.optional(),
})

const blockRotationSchema: z.ZodType<BlockRotation> = z.strictObject({
  rotate:   z.boolean().optional(),
  solve:    z.boolean().optional(),
  attempts: z.int().min(1).max(10).optional(),
})

const captchaSettingsSchema: z.ZodType<CaptchaSettings> = z.strictObject({
  solver:    z.string().min(1),
  detect:    z.strictObject({ selector: z.string().min(1) }).optional(),
  verify:    captchaCheckSchema.optional(),
  attempts:  z.int().min(1).max(10).optional(),
  timeoutMs: z.int().min(1000).optional(),
  maxSolves: z.int().nonnegative().optional(),
})

export const sessionSpecSchema: z.ZodType<SessionSpec> = z.strictObject({
  headers:          z.record(z.string(), z.string()).optional(),
  cookies:          z.array(cookieSchema).optional(),
  userAgent:        z.string().optional(),
  viewport:         z.strictObject({ width: z.int().positive(), height: z.int().positive() }).optional(),
  storageStatePath: z.string().optional(),
  bootstrap:        bootstrapSchema.optional(),
  access:           sessionAccessSchema.optional(),
  blockedWhen:      blockRuleSchema.optional(),
  onBlock:          blockRotationSchema.optional(),
  captcha:          captchaSettingsSchema.optional(),
  browserProfile:   z.string().regex(/^[\w-]+$/, 'a browser profile name is letters, digits, hyphens and underscores').optional(),
})

export const retryRuleSchema: z.ZodType<RetryRule> = z.strictObject({
  attempts:   z.int().min(1).max(10).optional(),
  backoffMs:  z.int().nonnegative().optional(),
  maxDelayMs: z.int().nonnegative().optional(),
  statuses:   z.array(z.int().min(400).max(599)).optional(),
})

const limitsSchema: z.ZodType<CrawlLimits> = z.strictObject({
  maxRecords:  z.int().positive().optional(),
  delayMs:     z.int().nonnegative().optional(),
  timeoutMs:   z.int().positive().optional(),
  concurrency: z.int().min(1).max(64).optional(),
  retry:       retryRuleSchema.optional(),
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
