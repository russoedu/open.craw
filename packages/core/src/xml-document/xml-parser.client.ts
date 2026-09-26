import { gunzipSync } from 'node:zlib'
import { DOMImplementation, DOMParser, XMLSerializer } from '@xmldom/xmldom'
import { load } from 'cheerio'

/** A parsed document, as the XPath engine sees it. */
export type XmlNode = Node

/** The documents already parsed, by the text they came from, so a recipe's extracts parse a body once. */
const parsed = new Map<string, Document>()
const PARSED_LIMIT = 16

/**
 * Parses XML strictly but safely: a malformed document is an error naming
 * the URL and the line; entities a DOCTYPE declares are never expanded (no
 * "billion laughs") and nothing external is ever fetched (no XXE), they stay
 * as they are.
 *
 * @param xml - The document text.
 * @param where - The URL or id, for messages.
 * @returns The document.
 * @throws Error when the text is not well-formed XML.
 */
export function parseXml (xml: string, where: string): Document {
  const cached = parsed.get(xml)
  if (cached !== undefined) return cached
  let document: Document
  try {
    document = new DOMParser({ onError: failOnFatal }).parseFromString(xml, 'text/xml') as unknown as Document
  } catch (error) {
    throw new Error(`${where}: not well-formed XML (${firstLine(error)})`, { cause: error })
  }
  if (document.documentElement === null) throw new Error(`${where}: not an XML document (no root element)`)
  remember(xml, document)

  return document
}

/**
 * HTML as an XML document, for XPath on fetched pages: parsed the way a
 * browser parses it (a forgiving HTML5 parser that inserts `<tbody>` and
 * closes what the page left open), without namespaces, so `//table/tbody/tr`
 * finds what it finds on the live page.
 *
 * @param html - A page or a fragment.
 * @returns The document.
 */
export function htmlAsXml (html: string): Document {
  const cached = parsed.get(html)
  if (cached !== undefined) return cached
  const whole = /^\s*(?:<!doctype|<html)/i.test(html)
  // A fragment (a row taken with `take: "html"`) keeps its cells, and gets one root to be a document.
  const xml = whole ? load(html).xml() : `<fragment>${load(html, undefined, false).xml()}</fragment>`
  const document = withoutNamespaces(new DOMParser({ onError: ignore }).parseFromString(xml, 'text/xml') as unknown as Document)
  remember(html, document)

  return document
}

/**
 * A copy of a document with every namespace dropped: elements and attributes
 * keep their local names, `xmlns` declarations go. What `ignoreNamespaces`
 * queries run on: `//entry/title` instead of `//atom:entry/atom:title`.
 *
 * @param document - A parsed document.
 * @returns The copy.
 */
export function withoutNamespaces (document: Document): Document {
  const copy = new DOMImplementation().createDocument(null, '', null) as unknown as Document
  const clone = (node: Node): Node | undefined => {
    if (node.nodeType === node.ELEMENT_NODE) {
      const element = node as Element
      const target = copy.createElement(element.localName)
      for (const attribute of element.attributes) {
        if (attribute.name === 'xmlns' || attribute.prefix === 'xmlns') continue
        target.setAttribute(attribute.localName, attribute.value)
      }
      for (const child of element.childNodes) {
        const cloned = clone(child)
        if (cloned !== undefined) target.insertBefore(cloned, null)
      }

      return target
    }
    if (node.nodeType === node.TEXT_NODE || node.nodeType === node.CDATA_SECTION_NODE) return copy.createTextNode(node.nodeValue ?? '')

    return undefined
  }
  const root = document.documentElement === null ? undefined : clone(document.documentElement)
  if (root !== undefined) copy.insertBefore(root, null)

  return copy
}

/**
 * A node as markup: the element with its children (`outer`), or its children only.
 *
 * @param node - A node.
 * @param outer - Whether to include the node itself.
 * @returns The markup.
 */
export function serializeXml (node: Node, outer: boolean): string {
  const serializer = new XMLSerializer()
  if (outer) return serializer.serializeToString(node as never)

  return Array.from(node.childNodes, child => serializer.serializeToString(child as never)).join('')
}

/**
 * The text of an XML body, gunzipped first when it is gzip (a `sitemap.xml.gz`).
 *
 * @param bytes - The body.
 * @returns The bytes to decode.
 */
export function gunzipIfNeeded (bytes: Uint8Array): Uint8Array {
  return bytes.length > 2 && bytes[0] === 0x1F && bytes[1] === 0x8B ? gunzipSync(bytes) : bytes
}

function remember (text: string, document: Document): void {
  if (parsed.size >= PARSED_LIMIT) parsed.delete(parsed.keys().next().value as string)
  parsed.set(text, document)
}

function failOnFatal (level: 'warning' | 'error' | 'fatalError', message: string): void {
  if (level === 'fatalError') throw new Error(message)
}

function ignore (): void {}

function firstLine (error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).split('\n', 1)[0]
}
