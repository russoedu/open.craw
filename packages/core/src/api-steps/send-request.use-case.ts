import type { EventBus } from '../crawl-events'
import type { ExtractionScope } from '../extraction-scope'
import { HttpError } from '../http-session'
import type { HttpBody, HttpResponse, HttpSender } from '../http-session'
import type { InputRecipe, RequestStep } from '../recipe-schema'
import { deckText } from '../deck-document'
import { pdfText } from '../pdf-document'
import { workbookText } from '../workbook-document'
import { renderDeep, renderText } from '../template'
import { BlockedError, detectBlock, resolveRetryRule, transientError, withTransportRetry } from '../step-flow'
import type { Transient } from '../step-flow'
import type { RunGate } from '../step-flow'

/**
 * Sends a `request` step: renders its templates, waits for the gate's throttle,
 * sends (again, after a pause, while it fails in passing: `limits.retry`),
 * checks the response against the recipe's block rule, then binds it as the
 * scope's current document (and under the step id).
 *
 * @param step - The request step.
 * @param scope - The scope to render in and bind into.
 * @param client - The HTTP sender.
 * @param recipe - The recipe: its limits, block rule and id.
 * @param gate - Spaces request starts by `delayMs`.
 * @param events - Where to report the visit.
 * @throws BlockedError when the response is a block, or a captcha page under `session.captcha`; HttpError for any other 4xx/5xx.
 */
export async function sendRequest (step: RequestStep, scope: ExtractionScope, client: HttpSender, recipe: InputRecipe, gate: RunGate, events: EventBus): Promise<void> {
  const lookup = (path: string): unknown => scope.lookup(path)
  const url = resolveUrl(renderText(step.url, lookup), scope.pageState?.url)
  const request = {
    method:    step.method,
    url,
    query:     step.query === undefined ? undefined : renderMap(step.query, lookup),
    headers:   step.headers === undefined ? undefined : renderMap(step.headers, lookup),
    body:      renderDeep(step.body, lookup),
    as:        step.as,
    encoding:  step.encoding,
    delimiter: step.delimiter,
    scalars:   step.scalars,
    timeoutMs: recipe.limits?.timeoutMs,
  }
  const rule = resolveRetryRule(recipe.limits?.retry)
  let response: HttpResponse
  try {
    response = await withTransportRetry(url, { run: () => client.send(request), problem: outcome => ('error' in outcome ? problemOf(outcome.error, rule.statuses) : undefined) }, { recipeId: recipe.id, gate, events, rule })
  } catch (error) {
    if (!(error instanceof HttpError)) throw error
    events.emit({ type: 'page:visit', recipeId: recipe.id, url: error.url, number: scope.pageState?.number ?? 1, status: error.status })
    throw await detectBlock({ url: error.url, status: error.status, headers: error.headers, text: async () => bodyText(error.body) }, recipe.session?.blockedWhen) ?? error
  }
  events.emit({ type: 'page:visit', recipeId: recipe.id, url: response.url, number: scope.pageState?.number ?? 1, status: response.status })
  const warnings = response.warnings ?? []
  for (const warning of warnings) events.emit({ type: 'warning', recipeId: recipe.id, message: `${response.url}: ${warning}`, meta: { url: response.url } })
  const blocked = await detectBlock({ url: response.url, status: response.status, headers: response.headers, text: async () => bodyText(response.body) }, recipe.session?.blockedWhen)
  if (blocked !== undefined) throw blocked
  if (recipe.session?.captcha !== undefined && response.body.kind === 'html' && CAPTCHA_MARKUP.test(response.body.html)) {
    throw new BlockedError(response.url, response.status, 'the page shows a captcha, which is solved on a live page: run this recipe in web mode, or get past it in session.bootstrap')
  }
  scope.setPage({ url: response.url, document: response.body })
  if (step.id !== undefined) scope.set(step.id, documentValue(response.body))
}

/** A retry status (with the server's `Retry-After`), or a connection that failed. */
function problemOf (error: unknown, statuses: readonly number[]): Transient | undefined {
  if (error instanceof HttpError) return statuses.includes(error.status) ? { reason: `HTTP ${error.status}`, retryAfter: error.headers['retry-after'] } : undefined

  return transientError(error)
}

/** The class names of the widgets `session.captcha` solves. Checked only when a recipe declares it. */
const CAPTCHA_MARKUP = /\b(?:g-recaptcha|h-captcha|cf-turnstile)\b/

function bodyText (body: HttpBody): string {
  if (body.kind === 'json') return JSON.stringify(body.data)
  if (body.kind === 'pdf') return pdfText(body)
  if (body.kind === 'workbook') return workbookText(body)
  if (body.kind === 'deck') return deckText(body)
  if (body.kind === 'xml') return body.xml

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

/** What a step id holds for a document: parsed JSON, the read PDF, workbook or deck, or the markup / text. */
export function documentValue (body: HttpBody): unknown {
  if (body.kind === 'json') return body.data
  if (body.kind === 'html') return body.html

  return body.kind === 'text' ? body.text : body
}
