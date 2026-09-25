import type { Page } from 'playwright'
import type { LiveElement } from '../extraction-scope'
import { collapse } from '../selection'

/**
 * Snapshots every element a selector matches, in one round trip, for a
 * `forEach` over `selector`. Each snapshot carries the selector and its index
 * so a later `target` can find the element again, even after a re-render.
 *
 * @param selector - A css selector (or `xpath=...`), already rendered.
 * @param page - The page.
 * @returns One snapshot per match, in document order.
 */
export async function snapshotElements (selector: string, page: Page): Promise<LiveElement[]> {
  const raw = await page.locator(selector).evaluateAll(readElements)

  return raw.map((element, index) => ({ selector, index, ...element, text: collapse(element.text) }))
}

/** Runs inside the page. Keep it self-contained; it is serialised. */
function readElements (elements: Element[]): Omit<LiveElement, 'selector' | 'index'>[] {
  return elements.map((element) => {
    const attrs: Record<string, string> = {}
    for (const attribute of element.attributes) attrs[attribute.name] = attribute.value
    const value = (element as HTMLInputElement).value

    return { text: element.textContent ?? '', html: element.getHTML(), attrs, value: typeof value === 'string' ? value : undefined }
  })
}
