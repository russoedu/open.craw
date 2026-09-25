import { load } from 'cheerio'
import type { Cheerio, CheerioAPI } from 'cheerio'
import type { AnyNode } from 'domhandler'

/** A matched HTML element together with the document it belongs to. */
export interface HtmlMatch {
  api:     CheerioAPI
  element: Cheerio<AnyNode>
}

const DOCUMENT = /^\s*(?:<!doctype|<html)/i

/**
 * Runs a CSS selector on static HTML. A whole document is parsed as one; anything
 * else (a table row, a list item taken with `take: "html"`) is parsed as a
 * fragment, so cells and rows outside a table survive instead of being dropped.
 *
 * @param html - The markup (a whole document or a fragment).
 * @param selector - A CSS selector.
 * @returns Every match, in document order.
 */
export function selectHtml (html: string, selector: string): HtmlMatch[] {
  const api = DOCUMENT.test(html) ? load(html) : load(html, undefined, false)

  return api(selector).map((_, element) => ({ api, element: api(element) })).toArray()
}
