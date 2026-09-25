/**
 * Finds where a fetched page's data lives: JSON-LD blocks, inline JSON objects
 * big enough to matter, URLs that look like a data endpoint, script hosts and
 * links whose path suggests an API. Pattern-matching only; it never fetches.
 */

export interface JsonLdFinding {
  /** The `@type` value(s), or `'?'` when the block has none. */
  types: string
  /** How many top-level keys the block has. */
  keys:  number
}

export interface InlineJsonFinding {
  /** Where it was found: a `<script>` with no `type`, or an attribute. */
  where: string
  keys:  string[]
  /** Serialized size, for ranking. */
  size:  number
}

export interface ProbeFindings {
  jsonLd:      JsonLdFinding[]
  inlineJson:  InlineJsonFinding[]
  /** URLs referenced in the page whose path ends in `.json`. */
  jsonUrls:    string[]
  /** Distinct hosts the page loads a `<script src>` from. */
  scriptHosts: string[]
  /** Links whose path contains `api`. */
  apiLinks:    string[]
}

const MIN_INLINE_SIZE = 200
const JSON_LD = /<script[^\s>]*\s+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
const INLINE_SCRIPT = /<script(?![^>]*\ssrc=)(?![^>]*\stype=["']application\/ld\+json["'])[^>]*>([\s\S]*?)<\/script>/gi
const DATA_ATTR = /data-[\w-]+=["'](\{[\s\S]*?\})["']/g
const SCRIPT_SRC = /<script[^\s>]*\s+src=["']([^"']+)["']/gi
const HREF_OR_JSON_URL = /["'](https?:\/\/[^"'\s]+\.json[^"'\s]*|\/[^"'\s]*\.json[^"'\s]*)["']/g
const LINK = /<a[^\s>]*\s+href=["']([^"']+)["']/gi

/**
 * Scans a page's HTML for data-shaped things.
 *
 * @param html - The document.
 * @returns What was found, each list capped at a handful of entries.
 */
export function findData (html: string): ProbeFindings {
  return {
    jsonLd:      jsonLdBlocks(html),
    inlineJson:  inlineJsonBlocks(html),
    jsonUrls:    unique(matchesOf(HREF_OR_JSON_URL, html)).slice(0, 10),
    scriptHosts: scriptHosts(html),
    apiLinks:    apiLinks(html),
  }
}

function jsonLdBlocks (html: string): JsonLdFinding[] {
  const findings: JsonLdFinding[] = []
  for (const text of matchesOf(JSON_LD, html)) {
    const parsed = tryParse(text)
    if (parsed === undefined) continue
    findings.push(...entriesOf(parsed))
  }

  return findings.slice(0, 10)
}

/** Every plain object in a JSON-LD block (it may be one object or an array of them), as a finding. */
function entriesOf (parsed: unknown): JsonLdFinding[] {
  const list = Array.isArray(parsed) ? parsed : [parsed]

  return list.flatMap((entry) => {
    if (typeof entry !== 'object' || entry === null) return []
    const record = entry as Record<string, unknown>
    const type = record['@type']

    return [{ types: Array.isArray(type) ? type.join(',') : String(type ?? '?'), keys: Object.keys(record).length }]
  })
}

function inlineJsonBlocks (html: string): InlineJsonFinding[] {
  const findings: InlineJsonFinding[] = []
  for (const text of matchesOf(INLINE_SCRIPT, html)) findings.push(...objectsIn(text, 'inline script'))
  for (const text of matchesOf(DATA_ATTR, html, 1)) findings.push(...objectsIn(text, 'data-* attribute'))

  return findings.filter(finding => finding.size >= MIN_INLINE_SIZE).sort((a, b) => b.size - a.size).slice(0, 10)
}

/** Every `{...}` in a text that parses as JSON, by scanning for balanced braces (regex cannot nest). */
function objectsIn (text: string, where: string): InlineJsonFinding[] {
  const found: InlineJsonFinding[] = []
  for (let at = text.indexOf('{'); at !== -1; at = text.indexOf('{', at + 1)) {
    const end = matchingBrace(text, at)
    if (end === -1) continue
    const candidate = text.slice(at, end + 1)
    const parsed = tryParse(candidate)
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      found.push({ where, keys: Object.keys(parsed), size: candidate.length })
      at = end
    }
  }

  return found
}

function matchingBrace (text: string, open: number): number {
  let depth = 0
  for (let at = open; at < text.length; at += 1) {
    if (text[at] === '{') depth += 1
    else if (text[at] === '}') {
      depth -= 1
      if (depth === 0) return at
    }
  }

  return -1
}

function scriptHosts (html: string): string[] {
  const hosts = matchesOf(SCRIPT_SRC, html).map((src) => {
    try {
      return new URL(src).host
    } catch {
      return
    }
  }).filter((host): host is string => host !== undefined)

  return unique(hosts).slice(0, 10)
}

function apiLinks (html: string): string[] {
  return unique(matchesOf(LINK, html).filter(href => /\bapi\b/i.test(href))).slice(0, 10)
}

function matchesOf (pattern: RegExp, text: string, group = 1): string[] {
  return Array.from(text.matchAll(pattern), match => match[group])
}

function unique (values: string[]): string[] {
  return [...new Set(values)]
}

function tryParse (text: string): unknown {
  try {
    return JSON.parse(text.trim()) as unknown
  } catch {
    return undefined
  }
}
