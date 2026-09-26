import type { Page } from 'playwright'
import { sendRequest } from '../api-steps'
import type { EventBus } from '../crawl-events'
import type { ExtractionScope } from '../extraction-scope'
import type { HttpSender } from '../http-session'
import type { InputRecipe, RequestForm, RequestStep } from '../recipe-schema'
import type { RunGate } from '../step-flow'
import { renderText } from '../template'

/**
 * Runs a `request` step in web mode: sent through the page's own session (its
 * cookies: a login, a solved captcha), the way the page's scripts call their
 * JSON endpoints, and read like an api request. With `form`, the body is the
 * form's fields as the browser would post them.
 *
 * @param step - The request step.
 * @param page - The live page, for `form`.
 * @param scope - The scope to render in and bind into.
 * @param client - A client over the page's request context.
 * @param recipe - The recipe: limits, block rule, id.
 * @param gate - The recipe's rate and the site's lane.
 * @param events - Where the visit is reported.
 */
export async function sendPageRequest (step: RequestStep, page: Page, scope: ExtractionScope, client: HttpSender, recipe: InputRecipe, gate: RunGate, events: EventBus): Promise<void> {
  const formBody = step.form === undefined ? undefined : await readForm(page, step.form, scope)
  await sendRequest(step, scope, client, recipe, gate, events, formBody)
}

/**
 * A form's fields, url-encoded: what the browser would post (`FormData`, so
 * disabled fields and unticked boxes are left out, and a multi-select sends
 * one field per chosen option), without `omit`, with `set` replacing a field
 * or adding it.
 *
 * @throws Error when the page has no such form.
 */
async function readForm (page: Page, form: RequestForm, scope: ExtractionScope): Promise<string> {
  const target = page.locator(form.selector).first()
  if (await target.count() === 0) throw new Error(`no form matches "${form.selector}"`)
  const entries = await target.evaluate(formEntries)
  const replaced = new Set([...(form.omit ?? []), ...Object.keys(form.set ?? {})])
  const parameters = new URLSearchParams(entries.filter(([name]) => !replaced.has(name)))
  const set = Object.entries(form.set ?? {})
  for (const [name, value] of set) parameters.append(name, renderText(value, path => scope.lookup(path)))

  return parameters.toString()
}

/** Runs inside the page. Keep it self-contained; it is serialised. */
function formEntries (element: Element): [string, string][] {
  const form = element instanceof HTMLFormElement ? element : element.closest('form')
  if (form === null) return []

  return [...new FormData(form)].flatMap(([name, value]) => (typeof value === 'string' ? [[name, value] as [string, string]] : []))
}
