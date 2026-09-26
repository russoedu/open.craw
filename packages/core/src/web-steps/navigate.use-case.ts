import type { Page } from 'playwright'
import type { EventBus } from '../crawl-events'
import type { ExtractionScope } from '../extraction-scope'
import type { GotoStep, InputRecipe } from '../recipe-schema'
import { detectBlock } from '../step-flow'
import type { RunGate } from '../step-flow'
import { renderText } from '../template'

/**
 * Runs a `goto` step: renders the URL (relative to the current page), waits for
 * the gate's throttle (`delayMs`), navigates, records the page's real URL in the
 * scope, and checks the response against the recipe's block rule.
 *
 * @throws BlockedError when the response is a block.
 */
export async function navigate (step: GotoStep, page: Page, scope: ExtractionScope, recipe: InputRecipe, gate: RunGate, events: EventBus): Promise<void> {
  const target = renderText(step.url, path => scope.lookup(path))
  const url = new URL(target, scope.pageState?.url ?? page.url()).href
  const release = await gate.request(url)
  let response
  try {
    response = await page.goto(url, { waitUntil: step.waitUntil, timeout: recipe.limits?.timeoutMs })
  } finally {
    release()
  }
  scope.setPage({ url: page.url() })
  events.emit({ type: 'page:visit', recipeId: recipe.id, url: page.url(), number: scope.pageState?.number ?? 1, status: response?.status() })
  if (response === null) return
  const blocked = await detectBlock({ url: page.url(), status: response.status(), headers: response.headers(), text: () => response.text() }, recipe.session?.blockedWhen)
  if (blocked !== undefined) throw blocked
}
