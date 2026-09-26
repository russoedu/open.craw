import type { Page } from 'playwright'
import type { EventBus } from '../crawl-events'
import type { ExtractionScope } from '../extraction-scope'
import type { GotoStep, InputRecipe } from '../recipe-schema'
import { detectBlock, resolveRetryRule, transientError, withTransportRetry } from '../step-flow'
import type { RunGate } from '../step-flow'
import { renderText } from '../template'

/**
 * Runs a `goto` step: renders the URL (relative to the current page), waits for
 * the gate's throttle (`delayMs`), navigates (again, after a pause, while it
 * fails in passing: `limits.retry`), records the page's real URL in the scope,
 * and checks the response against the recipe's block rule.
 *
 * @throws BlockedError when the response is a block.
 */
export async function navigate (step: GotoStep, page: Page, scope: ExtractionScope, recipe: InputRecipe, gate: RunGate, events: EventBus): Promise<void> {
  const target = renderText(step.url, path => scope.lookup(path))
  const url = new URL(target, scope.pageState?.url ?? page.url()).href
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
