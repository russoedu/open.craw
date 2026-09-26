import { useNamespaces } from 'xpath'
import type { SelectReturnType } from 'xpath'
import { collapse } from '../selection'
import type { Take } from '../selection'
import { serializeXml, withoutNamespaces } from './xml-parser.client'

/** An XPath result: a node, or what a function such as `count()` or `string()` gives. */
export type XpathValue = Node | string | number | boolean

export interface XpathOptions {
  /** Prefix to URI, for queries on namespaced documents (`atom: http://www.w3.org/2005/Atom`). */
  namespaces?:       Record<string, string>
  /** Drop the document's namespaces first, so plain names match (`//entry/title`). */
  ignoreNamespaces?: boolean
}

/**
 * Runs an XPath 1.0 query on a parsed document. Prefixes the root element
 * declares are known without being listed; a default namespace has no
 * prefix, so name one in `namespaces` or use `ignoreNamespaces`.
 *
 * @param document - The document.
 * @param expression - The query.
 * @param options - Namespaces.
 * @returns Every node selected, or the one value a function returned.
 * @throws Error naming the query when it does not parse or uses an unknown prefix.
 */
export function selectXpath (document: Document, expression: string, options: XpathOptions = {}): XpathValue[] {
  const target = options.ignoreNamespaces === true ? withoutNamespaces(document) : document
  const namespaces = { ...declaredPrefixes(target), ...options.namespaces }
  let result: SelectReturnType
  try {
    result = useNamespaces(namespaces)(expression, target)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const hint = /prefix|namespace|QName/i.test(message) ? ' (declare it in "namespaces", or set "ignoreNamespaces": true)' : ''
    throw new Error(`xpath ${expression}: ${message}${hint}`, { cause: error })
  }
  if (Array.isArray(result)) return result
  if (result === null) return []

  return [result]
}

/**
 * The value of an XPath result.
 *
 * @param value - A node or a function result.
 * @param take - `text` (whitespace collapsed), `html` (the node's inner markup), `json` (its outer markup), `value` (its text as is), `attr:<name>`.
 * @returns The value; `undefined` for a missing attribute.
 */
export function takeFromXml (value: XpathValue, take: Take): unknown {
  if (typeof value !== 'object') return take === 'text' ? collapse(String(value)) : value
  if (take === 'text') return collapse(value.textContent ?? '')
  if (take === 'value') return value.textContent ?? ''
  if (take === 'html') return serializeXml(value, false)
  if (take === 'json') return serializeXml(value, true)
  if (value.nodeType !== value.ELEMENT_NODE) return undefined
  const element = value as Element
  const name = take.slice('attr:'.length)

  return element.hasAttribute(name) ? element.getAttribute(name) : undefined
}

function declaredPrefixes (document: Document): Record<string, string> {
  const root = document.documentElement
  if (root === null) return {}

  return Object.fromEntries([...root.attributes].filter(attribute => attribute.prefix === 'xmlns').map(attribute => [attribute.localName, attribute.value]))
}
