import type { Page } from 'playwright'
import { extractFromDocument } from '../api-steps'
import type { ExtractionScope } from '../extraction-scope'
import type { ExtractStep } from '../recipe-schema'
import { collapse } from '../selection'
import { NoMatchError } from '../step-flow'

/**
 * Runs an `extract` step on the live page (css or xpath through locators, one
 * round trip for all matches). With `from`, it reads a fragment bound earlier
 * instead, the same way api mode reads a fetched document.
 */
export async function extractFromPage (step: ExtractStep, page: Page, scope: ExtractionScope): Promise<void> {
  if (step.from !== undefined) {
    extractFromDocument(step, scope)

    return
  }
  const selector = step.kind === 'xpath' ? `xpath=${step.selector}` : step.selector
  const take = step.take ?? 'text'
  const raw = await page.locator(selector).evaluateAll(readAll, take)
  const values = take === 'text' ? raw.map(value => (typeof value === 'string' ? collapse(value) : value)) : raw
  if (step.many === true) {
    if (step.id !== undefined) scope.set(step.id, values)

    return
  }
  if (values.length === 0) throw new NoMatchError(step.selector)
  if (step.id !== undefined) scope.set(step.id, values[0])
}

/** Runs inside the page: one value per matched element. Keep it self-contained; it is serialised. */
function readAll (elements: Element[], take: string): unknown[] {
  return elements.map((element) => {
    if (take === 'text') return element.textContent ?? ''
    if (take === 'html') return element.getHTML()
    if (take === 'value') return (element as HTMLInputElement).value
    if (take === 'json') return element.outerHTML
    const attribute = element.getAttribute(take.slice('attr:'.length))

    return attribute === null ? undefined : attribute
  })
}
