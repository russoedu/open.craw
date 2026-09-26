import type { Page } from 'playwright'
import { extractFromDocument, renderSelector, tablesIn } from '../api-steps'
import type { ExtractionScope } from '../extraction-scope'
import type { ExtractStep } from '../recipe-schema'
import { collapse, selectRegex } from '../selection'
import { NoMatchError } from '../step-flow'

/**
 * Runs an `extract` step on the live page (css or xpath through locators, one
 * round trip for all matches). With `from`, it reads a fragment bound earlier
 * instead, and a `jsonpath` reads the JSON a `request` fetched, the same way
 * api mode reads a fetched document.
 */
export async function extractFromPage (step: ExtractStep, page: Page, scope: ExtractionScope): Promise<void> {
  // A bound fragment, or JSON a `request` fetched: read as api mode reads a document.
  if (step.from !== undefined || step.kind === 'jsonpath') {
    extractFromDocument(step, scope)

    return
  }
  const values = step.kind === 'table' ? tablesIn({ kind: 'html', html: await page.content() }, step, scope) : await readPage(step, page, scope)
  if (step.many === true) {
    if (step.id !== undefined) scope.set(step.id, values)

    return
  }
  if (values.length === 0) throw new NoMatchError(step.selector)
  if (step.id !== undefined) scope.set(step.id, values[0])
}

/** A css, xpath or regex extract on the live page. */
async function readPage (step: ExtractStep, page: Page, scope: ExtractionScope): Promise<unknown[]> {
  const rendered = renderSelector(step.selector, scope)
  const take = step.take ?? 'text'
  const raw = step.kind === 'regex'
    ? selectRegex(await page.content(), rendered)
    : await page.locator(step.kind === 'xpath' ? `xpath=${rendered}` : rendered).evaluateAll(readAll, take)

  return take === 'text' ? raw.map(value => (typeof value === 'string' ? collapse(value) : value)) : raw
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
