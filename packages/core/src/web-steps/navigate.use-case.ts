import type { Page } from 'playwright'
import type { EventBus } from '../crawl-events'
import type { ExtractionScope } from '../extraction-scope'
import type { CrawlLimits, GotoStep } from '../recipe-schema'
import { sleep } from '../step-flow'
import { renderText } from '../template'

/**
 * Runs a `goto` step: renders the URL (relative to the current page), waits
 * `delayMs`, navigates, then records the page's real URL in the scope.
 */
export async function navigate (step: GotoStep, page: Page, scope: ExtractionScope, limits: CrawlLimits, events: EventBus, recipeId: string): Promise<void> {
  const target = renderText(step.url, path => scope.lookup(path))
  const url = new URL(target, scope.pageState?.url ?? page.url()).href
  await sleep(limits.delayMs ?? 0)
  await page.goto(url, { waitUntil: step.waitUntil, timeout: limits.timeoutMs })
  scope.setPage({ url: page.url() })
  events.emit({ type: 'page:visit', recipeId, url: page.url(), number: scope.pageState?.number ?? 1 })
}
