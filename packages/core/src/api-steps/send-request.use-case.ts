import type { EventBus } from '../crawl-events'
import type { ExtractionScope } from '../extraction-scope'
import type { HttpBody, HttpSender } from '../http-session'
import type { CrawlLimits, RequestStep } from '../recipe-schema'
import { render, renderText } from '../template'
import { sleep } from '../step-flow'

/**
 * Sends a `request` step: renders its templates, waits `delayMs`, sends, then
 * binds the response as the scope's current document (and under the step id).
 *
 * @param step - The request step.
 * @param scope - The scope to render in and bind into.
 * @param client - The HTTP sender.
 * @param limits - The recipe's limits.
 * @param events - Where to report the visit.
 * @param recipeId - For events.
 */
export async function sendRequest (step: RequestStep, scope: ExtractionScope, client: HttpSender, limits: CrawlLimits, events: EventBus, recipeId: string): Promise<void> {
  const lookup = (path: string): unknown => scope.lookup(path)
  const url = renderText(step.url, lookup)
  await sleep(limits.delayMs ?? 0)
  const response = await client.send({
    method:    step.method,
    url,
    query:     step.query === undefined ? undefined : renderMap(step.query, lookup),
    headers:   step.headers === undefined ? undefined : renderMap(step.headers, lookup),
    body:      typeof step.body === 'string' ? render(step.body, lookup) : step.body,
    as:        step.as,
    timeoutMs: limits.timeoutMs,
  })
  scope.setPage({ url: response.url, document: response.body })
  if (step.id !== undefined) scope.set(step.id, documentValue(response.body))
  events.emit({ type: 'page:visit', recipeId, url: response.url, number: scope.pageState?.number ?? 1 })
}

function renderMap (map: Record<string, string>, lookup: (path: string) => unknown): Record<string, string> {
  return Object.fromEntries(Object.entries(map).map(([key, value]) => [key, renderText(value, lookup)]))
}

/** What a step id holds for a document: parsed JSON, or the markup / text. */
export function documentValue (body: HttpBody): unknown {
  if (body.kind === 'json') return body.data

  return body.kind === 'html' ? body.html : body.text
}
