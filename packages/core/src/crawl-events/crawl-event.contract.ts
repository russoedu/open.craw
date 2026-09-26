/**
 * Everything a crawl reports while it runs. Payloads are structural on purpose:
 * this slice is a leaf, so it declares its own shapes instead of importing the
 * richer record and error types from the slices above it.
 */

interface Base { at: string, recipeId: string }

export type CrawlEvent =
  | (Base & { type: 'recipe:start', mode: 'web' | 'api' }) |
  (Base & { type: 'recipe:finish', emitted: number, rejected: number, duplicates: number, skipped: number, stepsSkipped?: number, pages: number, durationMs: number, error?: string }) |
  /** `status` is the HTTP status of the navigation or request, when there was a response. */
  (Base & { type: 'page:visit', url: string, number: number, status?: number }) |
  /** How a recipe run reaches the network. Never carries credentials. */
  (Base & { type: 'access:lease', profile: string, kind: string, server?: string, session?: string }) |
  /** A response matched the recipe's block rule. */
  (Base & { type: 'access:blocked', url: string, status: number, reason: string }) |
  /** The run gave up its access lease after a block and is taking a new one. */
  (Base & { type: 'access:rotate', attempt: number, reason: string }) |
  /** A captcha challenge is on the page. */
  (Base & { type: 'captcha:detected', url: string, kind: string, siteKey?: string }) |
  /** A solver is trying (`attempt` counts from 1 per challenge). */
  (Base & { type: 'captcha:solve', url: string, kind: string, solver: string, attempt: number }) |
  /** The page confirmed the solve. */
  (Base & { type: 'captcha:solved', url: string, kind: string, solver: string, attempt: number, durationMs: number }) |
  /** The solver failed, timed out, or the page still shows the challenge. */
  (Base & { type: 'captcha:failed', url: string, kind: string, solver: string, attempt: number, reason: string }) |
  /** A challenge was left unsolved: the run spent its `maxSolves`. */
  (Base & { type: 'captcha:budget', url: string, kind: string, max: number }) |
  (Base & { type: 'step:start', stepType: string, stepId?: string, path: string }) |
  (Base & { type: 'step:finish', stepType: string, stepId?: string, path: string, durationMs: number }) |
  (Base & { type: 'step:retry', stepType: string, stepId?: string, path: string, attempt: number, error: string }) |
  (Base & { type: 'step:skip', stepType: string, stepId?: string, path: string, error: string }) |
  (Base & { type: 'step:branch', path: string, branch: 'then' | 'else' }) |
  /** `scope` (the snapshot the record was mapped from) is present only under `CrawlOptions.debug`. */
  (Base & { type: 'record:emit', url: string, key: string | null, data: Record<string, unknown>, scope?: Record<string, unknown> }) |
  (Base & { type: 'record:reject', url: string, field: string, reason: string, scope?: Record<string, unknown> }) |
  (Base & { type: 'record:duplicate', url: string, key: string }) |
  /** A resumed run found the key already in the sink. */
  (Base & { type: 'record:skipped', url: string, key: string }) |
  (Base & { type: 'warning', message: string, meta?: Record<string, unknown> }) |
  (Base & { type: 'error', message: string, meta?: Record<string, unknown> })

export type CrawlEventType = CrawlEvent['type']

/** An event without its timestamp; the bus stamps `at`. */
export type CrawlEventInput = { [K in CrawlEventType]: Omit<Extract<CrawlEvent, { type: K }>, 'at'> }[CrawlEventType]

export type CrawlListener = (event: CrawlEvent) => void
