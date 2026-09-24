/**
 * JSON that arrives as text: a `<script type="application/ld+json">` body, a
 * `data-*` attribute, a fetched document read as text. Sites wrap inline JSON
 * in comment guards, which are stripped before parsing.
 */

/** Comment guards sites wrap inline JSON-LD in: a CDATA marker inside a block comment, or an HTML comment. */
const GUARDS = /^\s*(?:\/\*\s*<!\[CDATA\[\s*\*\/|<!\[CDATA\[|<!--)\s*|\s*(?:\/\*\s*\]\]>\s*\*\/|\]\]>|-->)\s*$/g

/**
 * Parses text as JSON, guards stripped.
 *
 * @param text - The text.
 * @returns The value, or `undefined` when it is not JSON.
 */
export function tryParseJson (text: string): unknown {
  try {
    return JSON.parse(text.replaceAll(GUARDS, '')) as unknown
  } catch {
    return undefined
  }
}

/**
 * Parses text that must be JSON.
 *
 * @param text - The text.
 * @param id - What the text is, for the error.
 * @returns The value.
 * @throws Error when it is not JSON.
 */
export function parseJsonText (text: string, id: string): unknown {
  const parsed = tryParseJson(text)
  if (parsed === undefined) throw new Error(`"${id}" is text but not JSON`)

  return parsed
}

/**
 * The data a value holds, whatever shape it arrived in: JSON text is parsed, a
 * list of texts becomes the list of its parsable entries, and an entry that
 * parses to a list is spliced in. Data that is not text is kept as is.
 *
 * @param value - A bound value: data, text, or a list of either.
 * @returns A list of items.
 */
export function dataItemsOf (value: unknown): unknown[] {
  if (typeof value === 'string') return itemsOf(tryParseJson(value))
  if (Array.isArray(value)) return value.flatMap(entry => (typeof entry === 'string' ? itemsOf(tryParseJson(entry)) : [entry]))

  return itemsOf(value)
}

function itemsOf (parsed: unknown): unknown[] {
  if (parsed === undefined || parsed === null) return []

  return Array.isArray(parsed) ? parsed : [parsed]
}
