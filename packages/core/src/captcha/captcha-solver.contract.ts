import type { Page } from 'playwright'
import type { AccessLease } from '../access'

/** The kinds of challenge detection tells apart. */
export type CaptchaKind = 'recaptcha-v2' | 'recaptcha-v3' | 'hcaptcha' | 'turnstile' | 'image' | 'unknown'

/** What the engine found on the page: enough for a token service, or for a solver that works on the page itself. */
export interface CaptchaChallenge {
  kind:      CaptchaKind
  /** The page the challenge is on. */
  url:       string
  /** The widget's site key (`data-sitekey`, or the `k` / `sitekey` of its iframe), when it has one. */
  siteKey?:  string
  /** The widget's action (`data-action`), when it declares one. */
  action?:   string
  /** A Playwright selector for the widget, or for the image of an image captcha. */
  selector?: string
}

export type CaptchaLog = (level: 'debug' | 'info' | 'warn' | 'error', message: string, meta?: Record<string, unknown>) => void

/** What a solver gets besides the challenge. */
export interface CaptchaContext {
  /** The live page: the solver may inject a token, fill a field, click. */
  page:    Page
  /** The access in use: token services often need the same IP (proxy) as the browser. */
  lease?:  AccessLease
  /** 1, 2, … within one solve loop. */
  attempt: number
  /** Aborted when the engine's timeout for this attempt runs out. */
  signal:  AbortSignal
  log:     CaptchaLog
}

/** A solver's report. The engine checks it: `solved` is a claim until the page confirms it. */
export type CaptchaOutcome = { status: 'solved' } | { status: 'failed', reason: string }

/**
 * A captcha solver: solves a challenge and applies the answer on the page
 * (injects a token and calls the widget's callback, types an image's text,
 * submits). Detection, verification, retries, rotation and the budget are the
 * engine's.
 */
export interface CaptchaSolver {
  name:  string
  solve: (challenge: CaptchaChallenge, context: CaptchaContext) => Promise<CaptchaOutcome> | CaptchaOutcome
}
