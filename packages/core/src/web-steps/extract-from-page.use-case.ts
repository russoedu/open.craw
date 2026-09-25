import type { Page } from 'playwright'
import { extractFromDocument, renderSelector } from '../api-steps'
import type { ExtractionScope } from '../extraction-scope'
import type { ExtractStep } from '../recipe-schema'
import { collapse, selectRegex } from '../selection'
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
  if (step.kind === 'table') throw new Error('table reads a PDF: fetch it with a request step in api mode, or extract "from" a PDF bound earlier')
  const rendered = renderSelector(step.selector, scope)
  const take = step.take ?? 'text'
  const raw = step.kind === 'regex'
    ? selectRegex(await page.content(), rendered)
    : await page.locator(step.kind === 'xpath' ? `xpath=${rendered}` : rendered).evaluateAll(readAll, take)
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
