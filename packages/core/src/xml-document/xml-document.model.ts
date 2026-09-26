/** A fetched XML document: a feed, a sitemap, an open-data export. Kept as text; queries parse it once. */
export interface XmlDocument {
  kind: 'xml'
  xml:  string
}

/**
 * Whether a value is a read XML document.
 *
 * @param value - Anything bound in a scope.
 * @returns `true` for an `XmlDocument`.
 */
export function isXmlDocument (value: unknown): value is XmlDocument {
  return typeof value === 'object' && value !== null && (value as { kind?: unknown }).kind === 'xml' && typeof (value as { xml?: unknown }).xml === 'string'
}
