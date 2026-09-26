import { once } from 'node:events'
import type { CaptchaChallenge, CaptchaContext, CaptchaOutcome, CaptchaSolver } from './captcha-solver.contract'

/** A person needs time: ten minutes per challenge unless the recipe says otherwise. */
const MANUAL_TIMEOUT_MS = 600_000

/**
 * The built-in `manual` solver, for headed runs: a person solves the challenge
 * in the browser window and submits it; the solver waits until the page
 * navigates (the form was posted) or the `verify.selector` element shows, and
 * reports it `submitted`, so the engine checks the page without running the
 * recipe's `submit` steps. It fills and clicks nothing.
 *
 * With a reader's audit on the same challenges, it collects what people typed
 * and whether the site took it: the labelled set a reader is tuned on.
 */
export const manualCaptchaSolver: CaptchaSolver = {
  name:      'manual',
  timeoutMs: MANUAL_TIMEOUT_MS,
  solve:     solveByHand,
}

async function solveByHand (challenge: CaptchaChallenge, context: CaptchaContext): Promise<CaptchaOutcome> {
  const { page, signal, verify, log } = context
  log('info', `waiting for a person to solve the ${challenge.kind} captcha on ${challenge.url}${challenge.field === undefined ? '' : ` (type it in ${challenge.field})`} and submit it`)
  const waits: Promise<unknown>[] = [page.waitForEvent('framenavigated', { predicate: frame => frame === page.mainFrame(), timeout: 0 })]
  if (verify?.selector !== undefined) waits.push(page.locator(verify.selector).first().waitFor({ state: 'visible', timeout: 0 }))
  // Once the race is decided, the other waits end with the page; their endings are of no interest.
  await Promise.race([...waits.map(wait => settled(wait)), once(signal, 'abort')])
  if (signal.aborted) return { status: 'failed', reason: 'nobody solved it in time' }

  return { status: 'solved', submitted: true }
}

/** Resolves when the wait ends, however it ends (a page that closes ends it too, and the engine's check then fails). */
async function settled (wait: Promise<unknown>): Promise<void> {
  try {
    await wait
  } catch {
    // ended by the page closing: the check that follows tells
  }
}
