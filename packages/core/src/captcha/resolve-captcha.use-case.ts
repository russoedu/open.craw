import type { Page } from 'playwright'
import type { AccessLease } from '../access'
import type { EventBus } from '../crawl-events'
import type { CaptchaCheck } from '../recipe-schema'
import type { CaptchaBudget } from './captcha-budget.model'
import { detectChallenge, isClear } from './captcha-detection.client'
import type { CaptchaChallenge, CaptchaOutcome, CaptchaSolver } from './captcha-solver.contract'
import { CaptchaError } from './captcha.error'

/** Default solves tried per challenge. */
export const DEFAULT_CAPTCHA_ATTEMPTS = 3
/** Default time one solve may take: token services take 10 to 60 seconds. */
export const DEFAULT_CAPTCHA_TIMEOUT_MS = 120_000
/** How long the page has to confirm a solve. */
const VERIFY_TIMEOUT_MS = 10_000
const VERIFY_POLL_MS = 250

/** One challenge to get past, and everything the loop needs for it. */
export interface CaptchaAttemptPlan {
  recipeId:  string
  page:      Page
  challenge: CaptchaChallenge
  solver:    CaptchaSolver
  /** Where challenges are, to re-detect and to confirm one is gone. */
  selector:  string
  verify?:   CaptchaCheck
  attempts:  number
  timeoutMs: number
  budget:    CaptchaBudget
  events:    EventBus
  lease?:    AccessLease
}

/**
 * Gets past one challenge: asks the solver, then checks the page (a solver's
 * `solved` is a claim; the challenge must be gone and/or the `verify` element
 * must appear), and tries again with what the page shows next, up to
 * `attempts`. Each try spends one solve of the run's budget.
 *
 * A failed try re-detects the challenge (a widget re-renders after a wrong
 * answer). When it is gone without the page confirming, the page is reloaded
 * for a fresh one; when a reload shows none, there is nothing left to solve.
 *
 * @param plan - The challenge, the solver and the limits.
 * @throws CaptchaError when every try failed, or the budget is spent.
 */
export async function resolveCaptcha (plan: CaptchaAttemptPlan): Promise<void> {
  const { recipeId, page, solver, events, budget } = plan
  let challenge = plan.challenge
  let reason = 'no attempt ran'
  for (let attempt = 1; attempt <= plan.attempts; attempt += 1) {
    if (!budget.take()) {
      events.emit({ type: 'captcha:budget', recipeId, url: challenge.url, kind: challenge.kind, max: budget.max })

      throw new CaptchaError(challenge.url, challenge.kind, attempt - 1, `left unsolved: the run's ${budget.max} solves are spent (session.captcha.maxSolves)`)
    }
    events.emit({ type: 'captcha:solve', recipeId, url: challenge.url, kind: challenge.kind, solver: solver.name, attempt })
    const started = Date.now()
    const outcome = await solveOnce(plan, challenge, attempt)
    if (outcome.status === 'solved' && await confirmed(page, challenge, plan)) {
      events.emit({ type: 'captcha:solved', recipeId, url: challenge.url, kind: challenge.kind, solver: solver.name, attempt, durationMs: Date.now() - started })

      return
    }
    reason = outcome.status === 'failed' ? outcome.reason : 'the page still shows the challenge'
    events.emit({ type: 'captcha:failed', recipeId, url: challenge.url, kind: challenge.kind, solver: solver.name, attempt, reason })
    if (attempt === plan.attempts) break
    const next = await nextChallenge(page, challenge, plan.selector)
    if (next === undefined) return
    challenge = next
  }

  throw new CaptchaError(challenge.url, challenge.kind, plan.attempts, `not solved after ${plan.attempts} attempt${plan.attempts === 1 ? '' : 's'}: ${reason}`)
}

/** Runs the solver once, bounded by the timeout; a throw or a malformed answer is a failure. */
async function solveOnce (plan: CaptchaAttemptPlan, challenge: CaptchaChallenge, attempt: number): Promise<CaptchaOutcome> {
  const controller = new AbortController()
  let timer: NodeJS.Timeout | undefined
  const timeout = new Promise<CaptchaOutcome>((resolve) => {
    timer = setTimeout(() => {
      controller.abort()
      resolve({ status: 'failed', reason: `the solver took longer than ${plan.timeoutMs} ms` })
    }, plan.timeoutMs)
  })
  const log = (level: 'debug' | 'info' | 'warn' | 'error', message: string, meta?: Record<string, unknown>): void => {
    plan.events.emit({ type: level === 'error' ? 'error' : 'warning', recipeId: plan.recipeId, message: `[${plan.solver.name}] ${message}`, meta })
  }
  const solving = (async (): Promise<CaptchaOutcome> => {
    try {
      return outcomeOf(await plan.solver.solve(challenge, { page: plan.page, lease: plan.lease, attempt, signal: controller.signal, log }))
    } catch (error) {
      return { status: 'failed', reason: error instanceof Error ? error.message : String(error) }
    }
  })()
  try {
    return await Promise.race([solving, timeout])
  } finally {
    clearTimeout(timer)
  }
}

function outcomeOf (value: unknown): CaptchaOutcome {
  if (typeof value !== 'object' || value === null) return { status: 'failed', reason: 'the solver returned no outcome' }
  const outcome = value as { status?: unknown, reason?: unknown }
  if (outcome.status === 'solved') return { status: 'solved' }

  return { status: 'failed', reason: typeof outcome.reason === 'string' ? outcome.reason : 'the solver reported a failure' }
}

/**
 * Whether the page confirms the solve: the challenge is gone (unless
 * `verify.gone` is `false`, or the challenge has no widget, as with reCAPTCHA
 * v3) and the `verify.selector` element is visible, within ten seconds.
 */
async function confirmed (page: Page, challenge: CaptchaChallenge, plan: CaptchaAttemptPlan): Promise<boolean> {
  const needGone = plan.verify?.gone !== false && challenge.selector !== undefined
  const shown = plan.verify?.selector
  if (!needGone && shown === undefined) return true
  const deadline = Date.now() + VERIFY_TIMEOUT_MS
  for (;;) {
    const gone = !needGone || await isClear(page, plan.selector)
    const visible = shown === undefined || await isVisible(page, shown)
    if (gone && visible) return true
    if (Date.now() >= deadline) return false
    await page.waitForTimeout(VERIFY_POLL_MS)
  }
}

async function isVisible (page: Page, selector: string): Promise<boolean> {
  try {
    return await page.locator(selector).first().isVisible()
  } catch {
    return false
  }
}

/** The challenge to try next: what the page shows now, else what a reload shows, else none. A widgetless challenge is tried as it is. */
async function nextChallenge (page: Page, previous: CaptchaChallenge, selector: string): Promise<CaptchaChallenge | undefined> {
  if (previous.selector === undefined) return previous
  const current = await detectChallenge(page, selector)
  if (current !== undefined) return current
  await page.reload()

  return detectChallenge(page, selector)
}
