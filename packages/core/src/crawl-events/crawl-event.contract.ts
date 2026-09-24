/**
 * Everything a crawl reports while it runs. Payloads are structural on purpose:
 * this slice is a leaf, so it declares its own shapes instead of importing the
 * richer record and error types from the slices above it.
 */

interface Base { at: string, recipeId: string }

export type CrawlEvent =
  | (Base & { type: 'recipe:start', mode: 'web' | 'api' }) |
  (Base & { type: 'recipe:finish', emitted: number, rejected: number, duplicates: number, pages: number, durationMs: number, error?: string }) |
  (Base & { type: 'page:visit', url: string, number: number }) |
  (Base & { type: 'step:start', stepType: string, stepId?: string, path: string }) |
  (Base & { type: 'step:finish', stepType: string, stepId?: string, path: string, durationMs: number }) |
  (Base & { type: 'step:retry', stepType: string, stepId?: string, path: string, attempt: number, error: string }) |
  (Base & { type: 'step:skip', stepType: string, stepId?: string, path: string, error: string }) |
  (Base & { type: 'step:branch', path: string, branch: 'then' | 'else' }) |
  (Base & { type: 'record:emit', url: string, key: string | null, data: Record<string, unknown> }) |
  (Base & { type: 'record:reject', url: string, field: string, reason: string }) |
  (Base & { type: 'record:duplicate', url: string, key: string }) |
  (Base & { type: 'warning', message: string, meta?: Record<string, unknown> }) |
  (Base & { type: 'error', message: string, meta?: Record<string, unknown> })

export type CrawlEventType = CrawlEvent['type']

/** An event without its timestamp; the bus stamps `at`. */
export type CrawlEventInput = { [K in CrawlEventType]: Omit<Extract<CrawlEvent, { type: K }>, 'at'> }[CrawlEventType]

export type CrawlListener = (event: CrawlEvent) => void
