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
  /** Where the answer goes, when the recipe says (a `captcha` step's `field`): a solver that reads the challenge fills it. */
  field?:    string
  /** What gives a new image, when the recipe says (`refresh`): a solver unsure of its read clicks it and reads again, without submitting. */
  refresh?:  string
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
  /** How the engine will confirm the solve: the element that shows when it worked, and the one that shows when it did not. */
  verify?: { selector?: string, failure?: string }
}

/**
 * A solver's report. The engine checks it: `solved` is a claim until the page
 * confirms it. `solved` means the solver did its part (filled the answer field,
 * or solved the widget); the engine then runs the recipe's `submit` steps,
 * unless the solver says it `submitted` already (a person pressed the button,
 * or a widget's callback posted the form).
 */
export type CaptchaOutcome = { status: 'solved', submitted?: boolean } | { status: 'failed', reason: string }

/** What the page said about a solved answer: accepted, or not. */
export type CaptchaVerdict = { status: 'solved' } | { status: 'rejected', reason: string }

/**
 * A captcha solver: does its part of a challenge on the page. A reader fills
 * the answer field with what it read; a widget solver solves the widget
 * (injects a token, clicks through a modal). Submitting (the recipe's `submit`
 * steps), detection, verification, retries, rotation and the budget are the
 * engine's.
 */
export interface CaptchaSolver {
  name:       string
  solve:      (challenge: CaptchaChallenge, context: CaptchaContext) => Promise<CaptchaOutcome> | CaptchaOutcome
  /** How long one solve may take when the recipe does not say (a person needs minutes, a service seconds). */
  timeoutMs?: number
  /** Told, after the engine checked the page, whether a `solved` answer was accepted: for an audit log, or a service's refund of bad answers. A throw is ignored. */
  verdict?:   (challenge: CaptchaChallenge, verdict: CaptchaVerdict) => Promise<void> | void
  /** Called when the crawler closes: a solver holding a worker or a connection lets it go. A throw is ignored. */
  close?:     () => Promise<void> | void
}
