/** How deep a probe describes a JSON document. */
const DEPTH = 4
/** Keys shown per object, at most. */
const KEY_LIMIT = 25
/** Entries of a record list whose keys are compared. */
const SAMPLE = 50
/** A sample value longer than this is cut. */
const SAMPLE_CHARS = 40

/** What a probe shows of JSON data (a JSON, JSON Lines or YAML body). */
export interface JsonFindings {
  /** What the body was read as. */
  format: string
  /** `object`, `array (n)`, or a scalar type. */
  type:   string
  /**
   * The document's structure down to four levels, one line per node:
   * `$.data.products  array (1240) of object`, `$.data.products[*].name  string "Pandina"`.
   */
  tree:   string[]
  /**
   * Every array of objects with two entries or more, largest first: the
   * `forEach` or `each` a recipe needs, with the keys all its entries share.
   */
  lists:  { path: string, length: number, keys: string[] }[]
}

/**
 * Summarises JSON data for someone writing a recipe: its shape, and where its
 * record lists are, so a `jsonpath` selector can be read off the result.
 *
 * @param data - The parsed document.
 * @param format - What it was read as (`json`, `jsonl`, `yaml`).
 * @returns The findings.
 */
export function describeJson (data: unknown, format: string): JsonFindings {
  const tree: string[] = []
  const lists: JsonFindings['lists'] = []
  walk(data, '$', 0, tree, lists)

  return { format, type: typeOf(data), tree, lists: lists.sort((first, second) => second.length - first.length) }
}

function walk (value: unknown, path: string, depth: number, tree: string[], lists: JsonFindings['lists']): void {
  if (Array.isArray(value)) {
    const objects = value.filter(entry => isObject(entry))
    if (objects.length >= 2 && objects.length === value.length) lists.push({ path: `${path}[*]`, length: value.length, keys: sharedKeys(objects.slice(0, SAMPLE)) })
    if (depth > 0) tree.push(`${path}  ${typeOf(value)}`)
    if (depth < DEPTH && value.length > 0) walk(value[0], `${path}[*]`, depth + 1, tree, lists)

    return
  }
  if (isObject(value)) {
    if (depth > 0) tree.push(`${path}  object`)
    if (depth >= DEPTH) return
    for (const [key, child] of Object.entries(value).slice(0, KEY_LIMIT)) walk(child, childPath(path, key), depth + 1, tree, lists)

    return
  }
  tree.push(`${path}  ${typeOf(value)}${sample(value)}`)
}

function typeOf (value: unknown): string {
  if (Array.isArray(value)) {
    const kinds = [...new Set(value.slice(0, SAMPLE).map(entry => typeOf(entry).split(' ', 1)[0]))]

    return `array (${value.length})${kinds.length === 0 ? '' : ` of ${kinds.join(' | ')}`}`
  }
  if (value === null) return 'null'

  return typeof value === 'object' ? 'object' : typeof value
}

function sample (value: unknown): string {
  if (value === null || value === undefined) return ''
  const text = JSON.stringify(value)

  return ` ${text.length > SAMPLE_CHARS ? `${text.slice(0, SAMPLE_CHARS)}…` : text}`
}

function sharedKeys (objects: readonly Record<string, unknown>[]): string[] {
  const [first, ...rest] = objects

  return Object.keys(first).filter(key => rest.every(object => Object.hasOwn(object, key)))
}

function childPath (path: string, key: string): string {
  return /^[$A-Z_][\w$]*$/i.test(key) ? `${path}.${key}` : `${path}['${key.replaceAll("'", String.raw`\'`)}']`
}

function isObject (value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
