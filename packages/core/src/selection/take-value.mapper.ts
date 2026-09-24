import type { HtmlMatch } from './html-selector.algorithm'

/** What `extract` takes from a match: text, inner HTML, an attribute, an input's value, or the node as data. */
export type Take = 'text' | 'html' | 'value' | 'json' | `attr:${string}`

/**
 * The value of an HTML match.
 *
 * @param match - A selected element.
 * @param take - What to take; `text` collapses whitespace.
 * @returns The value; `undefined` for a missing attribute.
 */
export function takeFromHtml (match: HtmlMatch, take: Take): unknown {
  if (take === 'text') return collapse(match.element.text())
  if (take === 'html') return match.element.html() ?? ''
  if (take === 'value') return match.element.val() ?? match.element.attr('value')
  if (take === 'json') return match.api.html(match.element)

  return match.element.attr(take.slice('attr:'.length))
}

/**
 * The value of a JSON match.
 *
 * @param node - A JSONPath result.
 * @param take - `json` keeps the node; `text` stringifies scalars.
 * @returns The value.
 */
export function takeFromJson (node: unknown, take: Take): unknown {
  if (take === 'json') return node
  if (node === null || node === undefined) return undefined
  if (typeof node === 'object') return JSON.stringify(node)

  return String(node)
}

/**
 * Text as a human reads it: runs of whitespace collapsed, ends trimmed.
 *
 * @param text - Raw text content.
 * @returns The collapsed text.
 */
export function collapse (text: string): string {
  return text.replaceAll(/\s+/g, ' ').trim()
}
