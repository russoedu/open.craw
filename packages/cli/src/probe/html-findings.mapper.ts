import { htmlTableSheets } from '@opencraw/core'
import { describeWorkbook } from './workbook-findings.mapper'

/** What a probe shows of an HTML document's tables, and of rendered Markdown's sections and front matter. */
export interface HtmlFindings {
  /** The likely header rows of the `<table>`s, with the `selector` a `table` extract needs. */
  tables:       { table: string, text: string, selector: string, hint?: string }[]
  /** Rendered Markdown: its headings, each with the selector of its section. */
  outline?:     { level: number, heading: string, selector: string }[]
  /** Rendered Markdown: the keys of its front matter. */
  frontMatter?: string[]
}

const SECTION = /<section data-heading="([^"]*)" data-level="(\d)">/g
const FRONT_MATTER = /<script type="application\/json" data-front-matter>([\s\S]*?)<\/script>/

/**
 * Summarises an HTML document for a `table` extract, and, when it is rendered
 * Markdown or a Word document, its outline (and Markdown's front matter).
 *
 * @param html - The document.
 * @param markdown - Whether it was rendered from Markdown or Word, and so has sections.
 * @returns The findings.
 */
export function describeHtml (html: string, markdown: boolean): HtmlFindings {
  const tables = htmlTableSheets(html)
  const headers = describeWorkbook({ kind: 'workbook', sheets: tables }).headers.map(({ sheet, row: _row, ...header }) => ({ table: sheet, ...header }))
  if (!markdown) return { tables: headers }
  const outline = Array.from(html.matchAll(SECTION), ([, heading, level]) => ({ level: Number(level), heading: unescape(heading), selector: `section[data-heading='${unescape(heading).replaceAll("'", String.raw`\'`)}' i]` }))
  const front = FRONT_MATTER.exec(html)?.[1]
  const data = front === undefined ? undefined : JSON.parse(front) as unknown

  return { tables: headers, outline, frontMatter: typeof data === 'object' && data !== null && !Array.isArray(data) ? Object.keys(data) : [] }
}

function unescape (text: string): string {
  return text.replaceAll('&quot;', '"').replaceAll('&lt;', '<').replaceAll('&amp;', '&')
}
