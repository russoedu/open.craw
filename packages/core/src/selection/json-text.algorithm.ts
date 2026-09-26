/**
 * JSON that arrives as text: a `<script type="application/ld+json">` body, a
 * `data-*` attribute, a fetched document read as text. Sites wrap JSON in
 * things that are not JSON: comment guards around inline JSON-LD, prefixes
 * that stop a page from loading an API as a script, a JSONP callback, an
 * assignment in an inline script. Those wrappers are removed, but only after
 * the text failed to parse as it is, and what is left must still be strict
 * JSON: nothing is evaluated.
 */

/** Comment guards sites wrap inline JSON-LD in: a CDATA marker inside a block comment, or an HTML comment. */
const GUARDS = /^\s*(?:\/\*\s*<!\[CDATA\[\s*\*\/|<!\[CDATA\[|<!--)\s*|\s*(?:\/\*\s*\]\]>\s*\*\/|\]\]>|-->)\s*$/g
/** Anti-hijacking prefixes: `)]}'` (with or without a comma), `while(1);`, `for(;;);`. */
const XSSI_PREFIX = /^\s*(?:\)\]\}'\s*,?|while\s*\(\s*1\s*\)\s*;|for\s*\(\s*;\s*;\s*\)\s*;)/
/** A JSONP call: `callback({...});`, the callback an identifier path. */
const JSONP = /^\s*[$A-Z_][\w$]*(?:\.[$A-Z_][\w$]*)*\s*\(([\s\S]*)\)\s*(?:;\s*)?$/i
/** An assignment in an inline script: `window.__STATE__ = {...};`, with `var`, `let` or `const` or none. */
const ASSIGNMENT = /^\s*(?:(?:var|let|const)\s+)?[$A-Z_a-z][\w$]*(?:\.[$A-Z_a-z][\w$]*|\[["'][^"']*["']\])*\s*=([\s\S]*)$/

/**
 * Parses text as JSON, or as JSON inside one of the wrappers sites put around
 * it: comment guards, an anti-hijacking prefix, a JSONP call, an assignment.
 * Valid JSON is always read as it is; a wrapper is only removed when that
 * fails.
 *
 * @param text - The text.
 * @returns The value, or the error the text as it is gave.
 */
export function parseJsonLike (text: string): { value: unknown } | { error: Error } {
  const direct = parseJson(text)
  if ('value' in direct) return direct
  const unguarded = text.replaceAll(GUARDS, '')
  const assigned = ASSIGNMENT.exec(unguarded)?.[1].trim().replace(/;$/, '')
  const candidates = [unguarded, unguarded.replace(XSSI_PREFIX, ''), JSONP.exec(unguarded)?.[1], assigned]
  for (const candidate of candidates) {
    if (candidate === undefined || candidate === text) continue
    const parsed = parseJson(candidate)
    if ('value' in parsed) return parsed
  }

  return direct
}

/**
 * Parses JSON Lines (NDJSON): one JSON value per non-blank line.
 *
 * @param text - The text.
 * @param source - Where it came from, for the error.
 * @returns The values, in order.
 * @throws Error naming the source and the line that does not parse.
 */
export function parseJsonLines (text: string, source: string): unknown[] {
  const values: unknown[] = []
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    if (line.trim() === '') continue
    const parsed = parseJson(line)
    if ('error' in parsed) throw new Error(`${source}: line ${index + 1} is not JSON (${parsed.error.message})`, { cause: parsed.error })
    values.push(parsed.value)
  }

  return values
}

/**
 * Parses text as JSON, wrappers removed (see {@link parseJsonLike}).
 *
 * @param text - The text.
 * @returns The value, or `undefined` when it is not JSON.
 */
export function tryParseJson (text: string): unknown {
  const parsed = parseJsonLike(text)

  return 'value' in parsed ? parsed.value : undefined
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

function parseJson (text: string): { value: unknown } | { error: Error } {
  try {
    return { value: JSON.parse(text) as unknown }
  } catch (error) {
    return { error: error as Error }
  }
}
