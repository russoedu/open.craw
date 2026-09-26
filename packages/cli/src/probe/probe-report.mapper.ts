import type { ProbeFindings } from './find-data.algorithm'
import type { DeckFindings } from './deck-findings.mapper'
import type { HtmlFindings } from './html-findings.mapper'
import type { JsonFindings } from './json-findings.mapper'
import type { XmlFindings } from './xml-findings.mapper'
import type { PdfFindings } from './pdf-findings.mapper'
import type { WorkbookFindings } from './workbook-findings.mapper'

/**
 * Renders a probe's findings as text.
 *
 * @param url - The URL probed.
 * @param status - The HTTP status.
 * @param findings - What `findData` found.
 * @param observed - JSON responses a browser saw, when `--browser` was used.
 * @param html - The tables (and, for Markdown, the outline and front matter) found.
 * @returns The report.
 */
export function probeReport (url: string, status: number, findings: ProbeFindings, observed: string[] = [], html?: HtmlFindings): string {
  const sections = [
    section('Markdown front matter (in script[data-front-matter])', html?.frontMatter === undefined || html.frontMatter.length === 0 ? [] : [`  keys: ${html.frontMatter.join(', ')}`]),
    section('Markdown sections (a "css" selector for each)', (html?.outline ?? []).map(entry => `  ${'  '.repeat(entry.level - 1)}${entry.selector}`)),
    section('HTML tables (a "table" extract selector for each)', (html?.tables ?? []).map(table => `  ${table.table}  ${table.selector}${table.hint === undefined ? '' : `  (${table.hint})`}\n        ${table.text}`)),
    section('JSON-LD blocks', findings.jsonLd.map(block => `  type=${block.types}, ${block.keys} keys`)),
    section('Inline JSON (candidates)', findings.inlineJson.map(block => `  ${block.where}, ${block.size} chars, keys: ${block.keys.slice(0, 8).join(', ')}`)),
    section('.json URLs referenced', findings.jsonUrls.map(url_ => `  ${url_}`)),
    section('Script hosts', findings.scriptHosts.map(host => `  ${host}`)),
    section('Links that look like an API', findings.apiLinks.map(link => `  ${link}`)),
    observed.length > 0 ? section('JSON responses observed in the browser', observed.map(entry => `  ${entry}`)) : '',
  ]

  return [`${url} (HTTP ${status})`, '', ...sections].filter(line => line !== '').join('\n')
}

/**
 * Renders what a probe found in a PDF as text.
 *
 * @param url - The URL or file probed.
 * @param pdf - What `describePdf` found.
 * @returns The report.
 */
export function pdfReport (url: string, pdf: PdfFindings): string {
  return [
    `${url} (PDF, ${pdf.pages} page${pdf.pages === 1 ? '' : 's'})`,
    '',
    section('Likely table headers (a "table" extract selector for each)', pdf.headers.map(header => `  p${header.page}  ${header.selector}\n        ${header.text}`)),
    section('First rows (cells separated by " | ")', pdf.rows.map(row => `  p${row.page}  ${row.text}`)),
  ].filter(line => line !== '').join('\n')
}

/**
 * Formats what a probe found in a workbook (a CSV or a spreadsheet): its sheets,
 * the rows that look like table headers with a selector for each, and the first
 * rows.
 *
 * @param url - The workbook's URL.
 * @param workbook - The findings.
 * @returns The report.
 */
export function workbookReport (url: string, workbook: WorkbookFindings): string {
  const read = workbook.csv === undefined ? 'workbook' : `CSV, ${workbook.csv.encoding}, delimited by ${delimiterName(workbook.csv.delimiter)}`

  return [
    `${url} (${read})`,
    '',
    section('Sheets', workbook.sheets.map(sheet => `  ${sheet.name}${sheet.hidden ? ' (hidden)' : ''}: ${sheet.rows} rows × ${sheet.columns} columns`)),
    section('Likely table headers (a "table" extract selector for each)', workbook.headers.map(header => `  ${header.sheet} r${header.row}  ${header.selector}${header.hint === undefined ? '' : `  (${header.hint})`}\n        ${header.text}`)),
    section('First rows (cells separated by " | ")', workbook.rows.map(row => `  ${row.sheet} r${row.row}  ${row.text}`)),
  ].filter(line => line !== '').join('\n')
}

/**
 * Formats what a probe found in a deck (a presentation): its slides, the native
 * tables' headers with a selector for each, its charts, and the slides whose
 * text boxes look like a table.
 *
 * @param url - The deck's URL.
 * @param deck - The findings.
 * @returns The report.
 */
export function deckReport (url: string, deck: DeckFindings): string {
  return [
    `${url} (presentation, ${deck.slides.length} slide${deck.slides.length === 1 ? '' : 's'}, ${deck.width} × ${deck.height} pt)`,
    '',
    section('Slides', deck.slides.map(slide => `  ${slide.number}  ${slide.title === '' ? '(no title)' : slide.title}${slide.hidden ? ' (hidden)' : ''}: ${slide.shapes} text boxes, ${slide.tables} tables, ${slide.charts} charts`)),
    section('Likely table headers (a "table" extract selector for each)', deck.headers.map(header => `  slide ${header.slide}  ${header.selector}${header.hint === undefined ? '' : `  (${header.hint})`}\n        ${header.text}`)),
    section('Text boxes laid out as a table (a "table" extract with "shapes": true)', deck.grids.map(grid => `  slide ${grid.slide}  ${grid.title}: ${grid.boxes} short boxes`)),
    section('Charts (read with jsonpath: $.slides[*].charts[*].series[*])', deck.charts.map(chart => `  slide ${chart.slide}  ${chart.type}${chart.title === undefined ? '' : ` "${chart.title}"`}: ${chart.series.map(series => `${series.name} (${series.points})`).join(', ')}`)),
  ].filter(line => line !== '').join('\n')
}

/**
 * Formats what a probe found in JSON data: its record lists with the path a
 * `jsonpath` extract needs, then its structure.
 *
 * @param url - The document's URL.
 * @param json - The findings.
 * @returns The report.
 */
export function jsonReport (url: string, json: JsonFindings): string {
  const read = { json: 'JSON', jsonl: 'JSON Lines', yaml: 'YAML' }[json.format] ?? json.format

  return [
    `${url} (${read}: ${json.type})`,
    '',
    section('Record lists (a "jsonpath" selector for each, largest first)', json.lists.map(list => `  ${list.path}  ${list.length} entries\n        keys: ${list.keys.join(', ')}`)),
    section('Structure', json.tree.map(line => `  ${line}`)),
  ].filter(line => line !== '').join('\n')
}

/**
 * Formats what a probe found in an XML document: its namespaces and the
 * `namespaces` an `xpath` extract needs, the elements that repeat, and its structure.
 *
 * @param url - The document's URL.
 * @param xml - The findings.
 * @returns The report.
 */
export function xmlReport (url: string, xml: XmlFindings): string {
  const defaultNamespace = xml.namespaces['']
  const namespaceRows = Object.entries(xml.namespaces).map(([prefix, uri]) => `  ${prefix === '' ? '(default)' : prefix}  ${uri}`)
  const hint = defaultNamespace === undefined
    ? []
    : ['', `  The elements are in a default namespace: query with "namespaces": { "x": "${defaultNamespace}" } and //x:${xml.root},`, '  or with "ignoreNamespaces": true and plain names, as below.']

  return [
    `${url} (XML: ${xml.root}${xml.sitemap === undefined ? '' : `, a sitemap of ${xml.sitemap.locations} ${xml.sitemap.kind === 'urlset' ? 'pages' : 'sitemaps'}`})`,
    '',
    section('Namespaces', [...namespaceRows, ...hint]),
    section('Repeated elements (an "xpath" selector for each, largest first)', xml.lists.map(list => `  ${list.path}  ${list.count} entries${list.children.length > 0 ? `\n        children: ${list.children.join(', ')}` : ''}`)),
    section('Structure', xml.tree.map(line => `  ${line}`)),
  ].filter(line => line !== '').join('\n')
}

function delimiterName (delimiter: string): string {
  const names: Record<string, string> = { '\t': 'tabs', ',': 'commas', ';': 'semicolons', '|': 'pipes' }

  return names[delimiter] ?? `"${delimiter}"`
}

function section (title: string, rows: string[]): string {
  if (rows.length === 0) return ''

  return [`${title}:`, ...rows, ''].join('\n')
}
