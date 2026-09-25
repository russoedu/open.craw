import { BrowserClient, HttpClient } from '@open.craw/core'
import type { CommonOptions } from '../arguments'
import type { Terminal } from '../terminal'
import { findData } from './find-data.algorithm'
import { probeReport } from './probe-report.mapper'

const BROWSER_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36'
const OBSERVE_MS = 4000

/**
 * Fetches a page and reports where its data lives. With `browser: true` it
 * also renders the page and lists the JSON responses seen while it settles,
 * which finds endpoints a plain fetch of the initial HTML cannot.
 *
 * @param url - The page to probe.
 * @param options - Browser path, TLS and user agent, plus whether to render.
 * @param terminal - Where the report goes.
 * @returns The exit code: 0, or 1 on a fetch failure.
 */
export async function probePage (url: string, options: { browser: boolean } & CommonOptions, terminal: Terminal): Promise<number> {
  const client = await HttpClient.open({ userAgent: options.userAgent ?? BROWSER_USER_AGENT, ignoreHTTPSErrors: options.insecureTls })
  try {
    const response = await client.send({ url, as: 'html' })
    const html = response.body.kind === 'html' ? response.body.html : ''
    const observed = options.browser ? await observeBrowserJson(url, options) : []
    terminal.out(probeReport(response.url, response.status, findData(html), observed))

    return 0
  } catch (error) {
    terminal.err(`probe failed: ${error instanceof Error ? error.message : String(error)}`)

    return 1
  } finally {
    await client.dispose()
  }
}

async function observeBrowserJson (url: string, options: CommonOptions): Promise<string[]> {
  const browser = await BrowserClient.launch({ executablePath: options.browserPath, ignoreHTTPSErrors: options.insecureTls })
  try {
    const session = await browser.newSession({ userAgent: options.userAgent })
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
