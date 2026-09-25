import { Parser } from 'htmlparser2'

/** Callbacks for {@link walkXml}; element names arrive without their namespace prefix. */
export interface XmlHandlers {
  open?:  (name: string, attributes: Record<string, string>) => void
  text?:  (text: string) => void
  close?: (name: string) => void
}

/**
 * Walks an XML part as a stream of events, never building a tree, so a sheet
 * of a million cells costs its text, not a DOM. htmlparser2 does no DTD
 * processing: entities a document declares are not expanded (no "billion
 * laughs") and no external entity is fetched (no XXE); only the XML built-ins
 * and numeric references decode.
 *
 * Element names lose their prefix (`x:c`, `p:sp` → `c`, `sp`): generators
 * choose prefixes freely. Attributes keep theirs; read a namespaced one with
 * {@link namespacedAttribute}.
 *
 * @param xml - The part's text.
 * @param handlers - What to do on each event.
 */
export function walkXml (xml: string, handlers: XmlHandlers): void {
  const parser = new Parser({
    onopentag:  (name, attributes) => handlers.open?.(localName(name), attributes),
    ontext:     text => handlers.text?.(text),
    onclosetag: name => handlers.close?.(localName(name)),
  }, { xmlMode: true, decodeEntities: true })
  parser.write(xml)
  parser.end()
}

/**
 * An attribute in a namespace whatever its prefix (`r:id`, `ns1:id`).
 *
 * @param attributes - The element's attributes.
 * @param name - The local name (`id`).
 * @returns The value, or `undefined`.
 */
export function namespacedAttribute (attributes: Record<string, string>, name: string): string | undefined {
  const key = Object.keys(attributes).find(candidate => candidate.endsWith(`:${name}`) && !candidate.startsWith('xmlns'))

  return key === undefined ? undefined : attributes[key]
}

/**
 * Whether an XML boolean attribute is on (`1`, `true`, `on`).
 *
 * @param value - The attribute's value.
 * @returns Whether it is set.
 */
export function isOn (value: string | undefined): boolean {
  return value !== undefined && ['1', 'true', 'on'].includes(value)
}

function localName (name: string): string {
  const colon = name.indexOf(':')

  return colon === -1 ? name : name.slice(colon + 1)
}
