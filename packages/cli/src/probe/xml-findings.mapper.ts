/** How deep a probe describes an XML document. */
const DEPTH = 5
/** Distinct paths shown, at most. */
const PATH_LIMIT = 60
/** A sample value longer than this is cut. */
const SAMPLE_CHARS = 40

/** The parts of a DOM node a probe reads (the core's XML parser gives W3C nodes). */
interface XmlNodeLike {
  nodeType:     number
  localName:    string | null
  textContent:  string | null
  childNodes:   Iterable<XmlNodeLike>
  attributes?:  Iterable<{ name: string, localName: string, prefix: string | null, value: string }>
  namespaceURI: string | null
}

/** What a probe shows of an XML document. */
export interface XmlFindings {
  /** The root element's local name. */
  root:       string
  /** Declared on the root: prefix (`''` for the default namespace) to URI. */
  namespaces: Record<string, string>
  /** Elements that repeat under one parent, largest first: the records, with the child names they share. */
  lists:      { path: string, count: number, children: string[] }[]
  /** One line per distinct element path (local names), with its count, attributes and a sample text. */
  tree:       string[]
  /** For a sitemap (`urlset`, `sitemapindex`): how many locations it lists. */
  sitemap?:   { kind: 'urlset' | 'sitemapindex', locations: number }
}

interface PathInfo {
  count:       number
  attributes:  Set<string>
  sample?:     string
  children:    Set<string>
  /** The most times this element appears under one parent. */
  maxSiblings: number
}

const ELEMENT = 1

/**
 * Summarises an XML document for someone writing a recipe: its namespaces
 * (and the `namespaces` a query needs), the elements that repeat (the
 * records a `forEach` walks), and its structure.
 *
 * @param document - A parsed document (`parseXml` from the core), read through the W3C DOM properties.
 * @returns The findings.
 */
export function describeXml (document: unknown): XmlFindings {
  const root = (document as { documentElement: XmlNodeLike | null }).documentElement
  if (root === null) return { root: '', namespaces: {}, lists: [], tree: [] }
  const paths = new Map<string, PathInfo>()
  walk(root, `/${root.localName ?? ''}`, 1, paths)
  const namespaces = Object.fromEntries(Array.from(root.attributes ?? [], attribute => attribute).filter(attribute => attribute.name === 'xmlns' || attribute.prefix === 'xmlns').map(attribute => [attribute.name === 'xmlns' ? '' : attribute.localName, attribute.value]))
  const lists = [...paths].filter(([, info]) => info.maxSiblings >= 2).map(([path, info]) => ({ path: `//${path.split('/').slice(-2).join('/')}`.replace(/^\/\/\//, '//'), count: info.count, children: [...info.children] })).sort((first, second) => second.count - first.count)
  const tree = [...paths].slice(0, PATH_LIMIT).map(([path, info]) => `${path}${info.count > 1 ? `  ×${info.count}` : ''}${info.attributes.size > 0 ? `  ${[...info.attributes].map(name => `@${name}`).join(' ')}` : ''}${info.sample === undefined ? '' : `  ${JSON.stringify(info.sample)}`}`)
  const name = root.localName ?? ''
  const sitemap = name === 'urlset' || name === 'sitemapindex' ? { kind: name, locations: paths.get(`/${name}/${name === 'urlset' ? 'url' : 'sitemap'}/loc`)?.count ?? 0 } as const : undefined

  return { root: name, namespaces, lists, tree, ...(sitemap !== undefined && { sitemap }) }
}

function walk (element: XmlNodeLike, path: string, depth: number, paths: Map<string, PathInfo>): void {
  const info = paths.get(path) ?? { count: 0, attributes: new Set<string>(), children: new Set<string>(), maxSiblings: 1 }
  paths.set(path, info)
  info.count += 1
  const attributes = element.attributes ?? []
  for (const attribute of attributes) {
    if (attribute.name !== 'xmlns' && attribute.prefix !== 'xmlns') info.attributes.add(attribute.name)
  }
  const children = [...element.childNodes].filter(child => child.nodeType === ELEMENT)
  if (children.length === 0) {
    const text = (element.textContent ?? '').replaceAll(/\s+/g, ' ').trim()
    if (text !== '' && info.sample === undefined) info.sample = text.length > SAMPLE_CHARS ? `${text.slice(0, SAMPLE_CHARS)}…` : text

    return
  }
  const siblings = new Map<string, number>()
  for (const child of children) {
    const name = child.localName ?? ''
    info.children.add(name)
    siblings.set(name, (siblings.get(name) ?? 0) + 1)
  }
  for (const child of children) {
    const childPath = `${path}/${child.localName ?? ''}`
    if (depth < DEPTH) walk(child, childPath, depth + 1, paths)
    const childInfo = paths.get(childPath)
    if (childInfo !== undefined) childInfo.maxSiblings = Math.max(childInfo.maxSiblings, siblings.get(child.localName ?? '') ?? 1)
  }
}
