import { load } from 'cheerio'
import type { AnyNode } from 'domhandler'
import { readYaml } from '../yaml-document'

/** Markdown, rendered. */
export interface MarkdownRead {
  /** A full HTML document: front matter in the head, the rendered body wrapped in sections. */
  html:        string
  /** The front matter's data, when there is some. */
  frontMatter: unknown
  warnings:    string[]
}

/**
 * `<` as the JSON escape `\u003c`, so a front matter value holding `</script>`
 * cannot close its element. Built from char codes: a formatter would turn a
 * literal escape back into `<`.
 */
const ESCAPED_LESS_THAN = String.fromCodePoint(92, 117, 48, 48, 51, 99)

/** A leading `---` block of YAML. */
const FRONT_MATTER = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/

/**
 * Renders Markdown (GitHub-flavoured: tables, task lists, strikethrough,
 * autolinks) to HTML with `marked`, imported on first use, so every `css`
 * selector works on it:
 *
 * - each heading and everything up to the next heading of the same or a higher
 *   level is wrapped in `<section data-heading="…" data-level="…">`, sections
 *   nesting, so "the table under *Prezzi*" is one selector;
 * - headings get slug ids (`<h2 id="prezzi">`);
 * - a leading `---` YAML block is parsed (YAML 1.2, as `as: "yaml"` reads it)
 *   and put in the head as `<script type="application/json" data-front-matter>`.
 *
 * Raw HTML in the Markdown is kept: it is data, parsed by cheerio, never run.
 *
 * @param text - The Markdown.
 * @param source - Where it came from, for messages.
 * @returns The HTML, the front matter's data and the YAML parser's warnings.
 * @throws Error naming the source when the front matter is not YAML.
 */
export async function readMarkdown (text: string, source: string): Promise<MarkdownRead> {
  const matter = FRONT_MATTER.exec(text)
  const body = matter === null ? text : text.slice(matter[0].length)
  const front = matter === null ? undefined : await readYaml(matter[1], `${source} front matter`)
  const { marked } = await import('marked')
  const rendered = marked.parse(body, { gfm: true, async: false })
  const sections = sectioned(rendered)
  const head = front === undefined ? '' : `<script type="application/json" data-front-matter>${JSON.stringify(front.data ?? null).replaceAll('<', () => ESCAPED_LESS_THAN)}</script>`

  return { html: `<!doctype html><html><head>${head}</head><body>${sections}</body></html>`, frontMatter: front?.data, warnings: front?.warnings ?? [] }
}

/** Wraps each heading and what follows it, up to the next heading of the same or a higher level, in a section. */
function sectioned (html: string): string {
  const $ = load(html, null, false)
  const open: number[] = []
  const used = new Map<string, number>()
  let out = ''
  const nodes: AnyNode[] = $.root().contents().toArray()
  for (const node of nodes) {
    const level = node.type === 'tag' ? /^h([1-6])$/.exec(node.name)?.[1] : undefined
    if (level === undefined) {
      out += $.html(node)
      continue
    }
    const depth = Number(level)
    while (open.length > 0 && (open.at(-1) ?? 0) >= depth) {
      open.pop()
      out += '</section>'
    }
    const heading = $(node)
    const text = heading.text().replaceAll(/\s+/g, ' ').trim()
    heading.attr('id', uniqueSlug(text, used))
    out += `<section data-heading="${escapeAttribute(text)}" data-level="${depth}">${$.html(node)}`
    open.push(depth)
  }

  return out + '</section>'.repeat(open.length)
}

/** GitHub's heading ids: lower case, spaces to hyphens, punctuation dropped, a counter for repeats. */
function uniqueSlug (text: string, used: Map<string, number>): string {
  const slug = text.toLowerCase().replaceAll(/[^\p{L}\p{N}\s-]/gu, '').trim().replaceAll(/\s/g, '-')
  const count = used.get(slug) ?? 0
  used.set(slug, count + 1)

  return count === 0 ? slug : `${slug}-${count}`
}

function escapeAttribute (text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;')
}
