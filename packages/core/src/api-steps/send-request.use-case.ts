import type { EventBus } from '../crawl-events'
import type { ExtractionScope } from '../extraction-scope'
import { HttpError } from '../http-session'
import type { HttpBody, HttpResponse, HttpSender } from '../http-session'
import type { InputRecipe, RequestStep } from '../recipe-schema'
import { pdfText } from '../pdf-document'
import { renderDeep, renderText } from '../template'
import { detectBlock } from '../step-flow'
import type { RunGate } from '../step-flow'

/**
 * Sends a `request` step: renders its templates, waits for the gate's throttle,
 * sends, checks the response against the recipe's block rule, then binds it as
 * the scope's current document (and under the step id).
 *
 * @param step - The request step.
 * @param scope - The scope to render in and bind into.
 * @param client - The HTTP sender.
 * @param recipe - The recipe: its limits, block rule and id.
 * @param gate - Spaces request starts by `delayMs`.
 * @param events - Where to report the visit.
 * @throws BlockedError when the response is a block; HttpError for any other 4xx/5xx.
 */
export async function sendRequest (step: RequestStep, scope: ExtractionScope, client: HttpSender, recipe: InputRecipe, gate: RunGate, events: EventBus): Promise<void> {
  const lookup = (path: string): unknown => scope.lookup(path)
  const url = resolveUrl(renderText(step.url, lookup), scope.pageState?.url)
  await gate.throttle()
  let response: HttpResponse
  try {
    response = await client.send({
      method:    step.method,
      url,
      query:     step.query === undefined ? undefined : renderMap(step.query, lookup),
      headers:   step.headers === undefined ? undefined : renderMap(step.headers, lookup),
      body:      renderDeep(step.body, lookup),
      as:        step.as,
      timeoutMs: recipe.limits?.timeoutMs,
    })
  } catch (error) {
    if (!(error instanceof HttpError)) throw error
    events.emit({ type: 'page:visit', recipeId: recipe.id, url: error.url, number: scope.pageState?.number ?? 1, status: error.status })
    throw await detectBlock({ url: error.url, status: error.status, headers: error.headers, text: async () => bodyText(error.body) }, recipe.session?.blockedWhen) ?? error
  }
  events.emit({ type: 'page:visit', recipeId: recipe.id, url: response.url, number: scope.pageState?.number ?? 1, status: response.status })
  const blocked = await detectBlock({ url: response.url, status: response.status, headers: response.headers, text: async () => bodyText(response.body) }, recipe.session?.blockedWhen)
  if (blocked !== undefined) throw blocked
  scope.setPage({ url: response.url, document: response.body })
  if (step.id !== undefined) scope.set(step.id, documentValue(response.body))
}

function bodyText (body: HttpBody): string {
  if (body.kind === 'json') return JSON.stringify(body.data)
  if (body.kind === 'pdf') return pdfText(body)

  return body.kind === 'html' ? body.html : body.text
}

function renderMap (map: Record<string, string>, lookup: (path: string) => unknown): Record<string, string> {
  return Object.fromEntries(Object.entries(map).map(([key, value]) => [key, renderText(value, lookup)]))
}

/**
 * A request URL relative to the current page (`/person/1158`, `?page=2`) resolves
 * against it, the way a browser resolves a link.
 *
 * @param target - The rendered URL.
 * @param base - The current page URL, if any.
 * @returns An absolute URL.
 */
function resolveUrl (target: string, base: string | undefined): string {
  try {
    return new URL(target, base === '' ? undefined : base).href
  } catch {
    throw new Error(`"${target}" is not a URL${base === undefined || base === '' ? ' and no page is known to resolve it against' : ` and cannot be resolved against ${base}`}`)
  }
}

/** What a step id holds for a document: parsed JSON, the read PDF, or the markup / text. */
export function documentValue (body: HttpBody): unknown {
  if (body.kind === 'json') return body.data
  if (body.kind === 'pdf') return body

  return body.kind === 'html' ? body.html : body.text
}
