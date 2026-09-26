import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { AccessBroker, BrowserClient, HttpClient, parseXml } from '@opencraw/core'
import type { AccessLease } from '@opencraw/core'
import { resolveAccess } from '../access'
import { loadPlugins } from '../hooks-module'
import type { CommonOptions } from '../arguments'
import type { Terminal } from '../terminal'
import { findData } from './find-data.algorithm'
import { describeDeck } from './deck-findings.mapper'
import type { DeckFindings } from './deck-findings.mapper'
import { describeHtml } from './html-findings.mapper'
import type { HtmlFindings } from './html-findings.mapper'
import { describeJson } from './json-findings.mapper'
import type { JsonFindings } from './json-findings.mapper'
import { describePdf } from './pdf-findings.mapper'
import type { PdfFindings } from './pdf-findings.mapper'
import { deckReport, jsonReport, pdfReport, probeReport, workbookReport, xmlReport } from './probe-report.mapper'
import { describeXml } from './xml-findings.mapper'
import type { XmlFindings } from './xml-findings.mapper'
import { describeWorkbook } from './workbook-findings.mapper'
import type { WorkbookFindings } from './workbook-findings.mapper'

const BROWSER_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36'
const OBSERVE_MS = 4000

/** What fetching and, optionally, rendering a page found. */
export interface ProbeResult {
  url:       string
  status:    number
  findings:  ReturnType<typeof findData>
  /** JSON responses observed while the page rendered; empty unless `options.browser` was set. */
  observed:  string[]
  /** Present when the URL is a PDF: its rows and likely table headers. */
  pdf?:      PdfFindings
  /** Present when the URL is a CSV or a spreadsheet: its sheets, rows and likely table headers. */
  workbook?: WorkbookFindings
  /** Present when the URL is a presentation: its slides, table headers, charts and text-box grids. */
  deck?:     DeckFindings
  /** Present when the URL is JSON, JSON Lines or YAML: its structure and record lists. */
  json?:     JsonFindings
  /** Present for HTML: its tables' headers; for rendered Markdown also its outline and front matter. */
  html?:     HtmlFindings
  /** Present for XML: its namespaces, repeated elements and structure. */
  xml?:      XmlFindings
}

/**
 * Fetches a page and finds where its data lives, through the access profile the
 * options name (direct without one). With `browser: true` it also
 * renders the page and lists the JSON responses seen while it settles, which
 * finds endpoints a plain fetch of the initial HTML cannot. No `Terminal`
 * involved: the cli's `probePage` and `@opencraw/mcp`'s probe tool both
 * build on this, one printing the result, the other returning it as data.
 *
 * A PDF, a spreadsheet, a CSV or a presentation (by content type, or a local
 * path) is read instead: its rows, and the rows that look like table headers.
 *
 * @param url - The page to probe, or a local file path.
 * @param options - Browser path, TLS and user agent, plus whether to render.
 * @returns What was found.
 * @throws Error when the fetch itself fails.
 */
export async function probeUrl (url: string, options: { browser: boolean } & CommonOptions): Promise<ProbeResult> {
  const plugins = options.plugins === undefined ? undefined : await loadPlugins(options.plugins)
  const lease = await new AccessBroker(await resolveAccess(options), plugins?.accessPlugins).lease({ recipeId: 'probe' })
  if (lease.cdp !== undefined) throw new Error(`access profile "${lease.profile}" is a remote browser; probe fetches over HTTP and needs a proxy profile`)
  const client = await HttpClient.open({
    userAgent:         options.userAgent ?? BROWSER_USER_AGENT,
    ignoreHTTPSErrors: options.insecureTls || lease.ignoreHTTPSErrors === true,
    proxy:             lease.proxy,
    headers:           lease.headers,
  })
  try {
    const target = /^[a-z][\w+.-]+:/i.test(url) ? url : pathToFileURL(resolve(url)).href
    // GitHub raw and CDNs serve Markdown as text/plain: a .md URL is read as Markdown.
    const markdown = /\.(?:md|markdown)$/i.test(new URL(target).pathname)
    const response = await client.send({ url: target, ...(markdown && { as: 'markdown' as const }) })
    const { body } = response
    if (body.kind === 'pdf') return { url: response.url, status: response.status, findings: findData(''), observed: [], pdf: describePdf(body) }
    if (body.kind === 'workbook') return { url: response.url, status: response.status, findings: findData(''), observed: [], workbook: describeWorkbook(body) }
    if (body.kind === 'deck') return { url: response.url, status: response.status, findings: findData(''), observed: [], deck: describeDeck(body) }
    if (body.kind === 'json') return { url: response.url, status: response.status, findings: findData(''), observed: [], json: describeJson(body.data, response.format ?? 'json') }
    if (body.kind === 'xml') return { url: response.url, status: response.status, findings: findData(''), observed: [], xml: describeXml(parseXml(body.xml, response.url)) }
    const text = body.kind === 'html' ? body.html : body.text
    const observed = options.browser && !target.startsWith('file:') ? await observeBrowserJson(url, options, lease) : []

    const html = body.kind === 'html' ? { html: describeHtml(body.html, response.format === 'markdown') } : {}

    return { url: response.url, status: response.status, findings: findData(text), observed, ...html }
  } finally {
    await client.dispose()
  }
}

/**
 * Fetches a page and reports where its data lives, to a `Terminal`.
 *
 * @param url - The page to probe.
 * @param options - Browser path, TLS and user agent, plus whether to render.
 * @param terminal - Where the report goes.
 * @returns The exit code: 0, or 1 on a fetch failure.
 */
export async function probePage (url: string, options: { browser: boolean } & CommonOptions, terminal: Terminal): Promise<number> {
  try {
    const result = await probeUrl(url, options)
    terminal.out(reportOf(result))

    return 0
  } catch (error) {
    terminal.err(`probe failed: ${error instanceof Error ? error.message : String(error)}`)

    return 1
  }
}

async function observeBrowserJson (url: string, options: CommonOptions, lease: AccessLease): Promise<string[]> {
  const browser = await BrowserClient.launch({ executablePath: options.browserPath, ignoreHTTPSErrors: options.insecureTls })
  try {
    const session = await browser.newSession({ userAgent: options.userAgent, proxy: lease.proxy, headers: lease.headers, ignoreHTTPSErrors: lease.ignoreHTTPSErrors })
    const seen: string[] = []
    session.page.on('response', (response) => {
      if ((response.headers()['content-type'] ?? '').includes('json')) seen.push(`${response.status()} ${response.url()}`)
    })
    try {
      await session.page.goto(url, { waitUntil: 'networkidle' })
    } catch {
      // a page that never idles (long-poll, websocket) still yields whatever the browser observed
    }
    await session.page.waitForTimeout(OBSERVE_MS)
    await session.close()

    return [...new Set(seen)].slice(0, 15)
  } finally {
    await browser.close()
  }
}

function reportOf (result: ProbeResult): string {
  if (result.pdf !== undefined) return pdfReport(result.url, result.pdf)
  if (result.workbook !== undefined) return workbookReport(result.url, result.workbook)
  if (result.deck !== undefined) return deckReport(result.url, result.deck)
  if (result.json !== undefined) return jsonReport(result.url, result.json)
  if (result.xml !== undefined) return xmlReport(result.url, result.xml)

  return probeReport(result.url, result.status, result.findings, result.observed, result.html)
}
