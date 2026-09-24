import { load } from 'cheerio'
import type { Cheerio, CheerioAPI } from 'cheerio'
import type { AnyNode } from 'domhandler'

/** A matched HTML element together with the document it belongs to. */
export interface HtmlMatch {
  api:     CheerioAPI
  element: Cheerio<AnyNode>
}

/**
 * Runs a CSS selector on static HTML.
 *
 * @param html - The markup (a whole document or a fragment).
 * @param selector - A CSS selector.
 * @returns Every match, in document order.
 */
export function selectHtml (html: string, selector: string): HtmlMatch[] {
  const api = load(html)

  return api(selector).map((_, element) => ({ api, element: api(element) })).toArray()
}
