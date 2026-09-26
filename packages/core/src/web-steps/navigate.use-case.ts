import type { Page } from 'playwright'
import type { EventBus } from '../crawl-events'
import type { ExtractionScope } from '../extraction-scope'
import type { GotoStep, InputRecipe } from '../recipe-schema'
import { detectBlock, resolveRetryRule, transientError, withTransportRetry } from '../step-flow'
import type { RunGate } from '../step-flow'
import { renderText } from '../template'
import { appears } from './interact.use-case'

/** How many times a page that never shows its `ready` element is loaded again, by default. */
const DEFAULT_RELOADS = 2
const DEFAULT_READY_TIMEOUT_MS = 30_000

/**
 * Runs a `goto` step: renders the URL (relative to the current page), waits for
 * the gate's throttle (`delayMs`), navigates (again, after a pause, while it
 * fails in passing: `limits.retry`), records the page's real URL in the scope,
 * and checks the response against the recipe's block rule. With `ready`, the
 * page must show that element; one that does not is loaded again (a site that
 * sometimes serves its shell without the content), up to `ready.reloads` times.
 *
 * @throws BlockedError when the response is a block.
 * @throws Error when the `ready` element never shows.
 */
export async function navigate (step: GotoStep, page: Page, scope: ExtractionScope, recipe: InputRecipe, gate: RunGate, events: EventBus): Promise<void> {
  const target = renderText(step.url, path => scope.lookup(path))
  const url = new URL(target, scope.pageState?.url ?? page.url()).href
  await load(step, url, page, scope, recipe, gate, events)
  const ready = step.ready
  if (ready === undefined) return
  const reloads = ready.reloads ?? DEFAULT_RELOADS
  const timeout = ready.timeoutMs ?? recipe.limits?.timeoutMs ?? DEFAULT_READY_TIMEOUT_MS
  for (let reload = 1; !await appears(page.locator(ready.selector).first(), timeout); reload += 1) {
    if (reload > reloads) throw new Error(`${url} never showed "${ready.selector}" (${reloads + 1} load${reloads === 0 ? '' : 's'}, ${timeout} ms each)`)
    events.emit({ type: 'request:retry', recipeId: recipe.id, url, attempt: reload + 1, reason: `"${ready.selector}" did not show`, delayMs: 0 })
    await load(step, url, page, scope, recipe, gate, events)
  }
}

/** Loads the page once (with the transport retries), records it, and checks it for a block. */
async function load (step: GotoStep, url: string, page: Page, scope: ExtractionScope, recipe: InputRecipe, gate: RunGate, events: EventBus): Promise<void> {
  const rule = resolveRetryRule(recipe.limits?.retry)
  const response = await withTransportRetry(url, {
    run:     () => page.goto(url, { waitUntil: step.waitUntil, timeout: recipe.limits?.timeoutMs }),
    problem: (outcome) => {
      if ('error' in outcome) return transientError(outcome.error)
      const status = outcome.value?.status()

      return status !== undefined && rule.statuses.includes(status) ? { reason: `HTTP ${status}`, retryAfter: outcome.value?.headers()['retry-after'] } : undefined
    },
  }, { recipeId: recipe.id, gate, events, rule })
  scope.setPage({ url: page.url() })
  events.emit({ type: 'page:visit', recipeId: recipe.id, url: page.url(), number: scope.pageState?.number ?? 1, status: response?.status() })
  if (response === null) return
  const blocked = await detectBlock({ url: page.url(), status: response.status(), headers: response.headers(), text: () => response.text() }, recipe.session?.blockedWhen)
  if (blocked !== undefined) throw blocked
}
