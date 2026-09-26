import { randomUUID } from 'node:crypto'
import type { Page } from 'playwright'
import type { AccessLease } from '../access'
import type { EventBus } from '../crawl-events'
import type { CaptchaCheck } from '../recipe-schema'
import type { CaptchaBudget } from './captcha-budget.model'
import { detectChallenge, isClear } from './captcha-detection.client'
import type { CaptchaChallenge, CaptchaOutcome, CaptchaSolver, CaptchaVerdict } from './captcha-solver.contract'
import { CaptchaError } from './captcha.error'

/** Default solves tried per challenge. */
export const DEFAULT_CAPTCHA_ATTEMPTS = 3
/** Default time one solve may take: token services take 10 to 60 seconds. */
export const DEFAULT_CAPTCHA_TIMEOUT_MS = 120_000
/** How long the page has to confirm a solve, by default. */
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
  /** A form captcha: the answer field and the refresh control handed to the solver, and the recipe's `submit` steps. */
  form?:     CaptchaForm
}

/** What a form captcha adds to a challenge: where the answer goes, what gives a new image, what sends the form. */
export interface CaptchaForm {
  field?:   string
  refresh?: string
  submit?:  () => Promise<void>
}

/** A mark put on the page before an attempt, to tell a refusal the attempt caused from one left over from the attempt before. */
interface PageMark {
  token:        string
  failureShown: boolean
}

/**
 * Gets past one challenge: asks the solver to do its part (fill the answer,
 * solve the widget), runs the form's `submit` steps unless the solver already
 * submitted, then checks the page (a solver's `solved` is a claim: the
 * challenge must be gone and/or the `verify` element must appear, and the
 * `verify.failure` element must not), tells the solver the verdict, and tries
 * again with what the page shows next, up to `attempts`. Each try spends one
 * solve of the run's budget.
 *
 * A failed try re-detects the challenge (a widget re-renders after a wrong
 * answer, a form comes back with a new image). When it is gone without the
 * page confirming, the page is reloaded for a fresh one; when a reload shows
 * none, there is nothing left to solve.
 *
 * @param plan - The challenge, the solver and the limits.
 * @throws CaptchaError when every try failed, or the budget is spent.
 */
export async function resolveCaptcha (plan: CaptchaAttemptPlan): Promise<void> {
  const { recipeId, page, solver, events, budget } = plan
  let challenge = withForm(plan.challenge, plan.form)
  let reason = 'no attempt ran'
  for (let attempt = 1; attempt <= plan.attempts; attempt += 1) {
    if (!budget.take()) {
      events.emit({ type: 'captcha:budget', recipeId, url: challenge.url, kind: challenge.kind, max: budget.max })

      throw new CaptchaError(challenge.url, challenge.kind, attempt - 1, `left unsolved: the run's ${budget.max} solves are spent (session.captcha.maxSolves)`)
    }
    events.emit({ type: 'captcha:solve', recipeId, url: challenge.url, kind: challenge.kind, solver: solver.name, attempt })
    const started = Date.now()
    const mark = await markPage(page, plan.verify?.failure)
    const outcome = await solveOnce(plan, challenge, attempt)
    if (outcome.status === 'solved') {
      const verdict = await submitAndCheck(plan, challenge, outcome, mark)
      await report(plan, challenge, verdict)
      if (verdict.status === 'solved') {
        events.emit({ type: 'captcha:solved', recipeId, url: challenge.url, kind: challenge.kind, solver: solver.name, attempt, durationMs: Date.now() - started })

        return
      }
      reason = verdict.reason
    } else {
      reason = outcome.reason
    }
    events.emit({ type: 'captcha:failed', recipeId, url: challenge.url, kind: challenge.kind, solver: solver.name, attempt, reason })
    if (attempt === plan.attempts) break
    const next = await nextChallenge(page, challenge, plan.selector)
    if (next === undefined) return
    challenge = withForm(next, plan.form)
  }

  throw new CaptchaError(challenge.url, challenge.kind, plan.attempts, `not solved after ${plan.attempts} attempt${plan.attempts === 1 ? '' : 's'}: ${reason}`)
}

/** The challenge with the form's answer field and refresh control, for the solver. */
function withForm (challenge: CaptchaChallenge, form: CaptchaForm | undefined): CaptchaChallenge {
  return { ...challenge, ...(form?.field !== undefined && { field: form.field }), ...(form?.refresh !== undefined && { refresh: form.refresh }) }
}

/** Runs the form's `submit` steps (unless the solver submitted), then asks the page. */
async function submitAndCheck (plan: CaptchaAttemptPlan, challenge: CaptchaChallenge, outcome: { submitted?: boolean }, mark: PageMark | undefined): Promise<CaptchaVerdict> {
  const submit = plan.form?.submit
  if (submit !== undefined && outcome.submitted !== true) {
    try {
      await submit()
    } catch (error) {
      return { status: 'rejected', reason: `the submit steps failed: ${error instanceof Error ? error.message : String(error)}` }
    }
  }

  return confirmed(plan.page, challenge, plan, mark)
}

/** Tells the solver what the page said; a solver that throws on it is reported, not fatal. */
async function report (plan: CaptchaAttemptPlan, challenge: CaptchaChallenge, verdict: CaptchaVerdict): Promise<void> {
  if (plan.solver.verdict === undefined) return
  try {
    await plan.solver.verdict(challenge, verdict)
  } catch (error) {
    plan.events.emit({ type: 'warning', recipeId: plan.recipeId, message: `[${plan.solver.name}] verdict failed: ${error instanceof Error ? error.message : String(error)}` })
  }
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
    // Debug lines are the solver's own detail: the trace shows what needs attention.
    if (level === 'debug') return
    plan.events.emit({ type: level === 'error' ? 'error' : 'warning', recipeId: plan.recipeId, message: `[${plan.solver.name}] ${message}`, meta })
  }
  const solving = (async (): Promise<CaptchaOutcome> => {
    try {
      const verify = plan.verify === undefined ? undefined : { selector: plan.verify.selector, failure: plan.verify.failure }

      return outcomeOf(await plan.solver.solve(challenge, { page: plan.page, lease: plan.lease, attempt, signal: controller.signal, log, verify }))
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
  const outcome = value as { status?: unknown, reason?: unknown, submitted?: unknown }
  if (outcome.status === 'solved') return { status: 'solved', ...(outcome.submitted === true && { submitted: true }) }

  return { status: 'failed', reason: typeof outcome.reason === 'string' ? outcome.reason : 'the solver reported a failure' }
}

/**
 * What the page says of a solve, polled until `verify.timeoutMs` (10 s): the
 * `verify.failure` element showing (on a page the attempt produced) is a
 * refusal at once; the challenge gone (unless `verify.gone` is `false`, or the
 * challenge has no widget, as with reCAPTCHA v3; a form captcha keeps its
 * image, so there it is not asked) and the `verify.selector` element visible
 * is an acceptance. With nothing to wait for, the solve stands.
 */
async function confirmed (page: Page, challenge: CaptchaChallenge, plan: CaptchaAttemptPlan, mark: PageMark | undefined): Promise<CaptchaVerdict> {
  const needGone = (plan.verify?.gone ?? plan.form === undefined) && challenge.selector !== undefined
  const shown = plan.verify?.selector
  const failure = plan.verify?.failure
  const positive = needGone || shown !== undefined
  if (!positive && failure === undefined) return { status: 'solved' }
  const timeout = plan.verify?.timeoutMs ?? VERIFY_TIMEOUT_MS
  const deadline = Date.now() + timeout
  for (;;) {
    if (failure !== undefined && await isVisible(page, failure) && await isFresh(page, mark)) return { status: 'rejected', reason: `the page refused it${await textOf(page, failure)}` }
    const gone = !needGone || await isClear(page, plan.selector)
    const visible = shown === undefined || await isVisible(page, shown)
    if (positive && gone && visible) return { status: 'solved' }
    if (Date.now() >= deadline) {
      if (!positive) return { status: 'solved' }

      return { status: 'rejected', reason: gone ? `"${shown}" did not show within ${timeout} ms` : 'the page still shows the challenge' }
    }
    await page.waitForTimeout(VERIFY_POLL_MS)
  }
}

/** Marks the page before an attempt, when a refusal element is to be watched, noting whether one shows already. */
async function markPage (page: Page, failure: string | undefined): Promise<PageMark | undefined> {
  if (failure === undefined) return undefined
  const token = randomUUID()
  try {
    await page.evaluate(`document.documentElement.dataset.opencrawCaptcha = ${JSON.stringify(token)}`)
  } catch {
    // a page navigating away has nothing to mark; the refusal element counts as new
  }

  return { token, failureShown: await isVisible(page, failure) }
}

/** Whether a refusal element belongs to this attempt: none showed before it, or the page is a new one (the mark is gone). */
async function isFresh (page: Page, mark: PageMark | undefined): Promise<boolean> {
  if (mark === undefined || !mark.failureShown) return true
  try {
    return await page.evaluate(`document.documentElement.dataset.opencrawCaptcha !== ${JSON.stringify(mark.token)}`)
  } catch {
    return false
  }
}

/** The element's text, quoted, for a failure reason; empty when it has none. */
async function textOf (page: Page, selector: string): Promise<string> {
  try {
    const text = (await page.locator(selector).first().textContent({ timeout: 1000 }) ?? '').trim()

    return text === '' ? '' : `: "${text.slice(0, 120)}"`
  } catch {
    return ''
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
