import type { Server } from 'node:http'
import { createCrawler, loadRecipes, memorySink } from '../src/index'
import type { CrawlEvent, CrawlReport } from '../src/index'
import { browserConfig, FIXTURE_BASE, startFixtureSite, stopFixtureSite } from './fixture-site'

let site: Server
beforeAll(async () => { site = await startFixtureSite() })
afterAll(async () => { await stopFixtureSite(site) })

const output = { kind: 'output', id: 'page', version: 1, fields: { text: { type: 'string', key: true, required: true } } }

function recipe (id: string, mode: 'web' | 'api', query: string, retry?: Record<string, unknown>): Record<string, unknown> {
  const fetch = mode === 'web' ? { type: 'goto', url: '{{start.url}}' } : { type: 'request', url: '{{start.url}}', as: 'html' }

  return {
    kind:    'input',
    id,
    output:  'page',
    mode,
    start:   [{ url: `${FIXTURE_BASE}/flaky?${query}` }],
    limits:  { retry: retry ?? { backoffMs: 50 } },
    steps:   [fetch, { type: 'extract', id: 'text', selector: '#ok', kind: 'css' }, { type: 'emit' }],
    mapping: { text: { from: 'text' } },
  }
}

async function crawl (recipes: unknown[]): Promise<{ report: CrawlReport, retries: Extract<CrawlEvent, { type: 'request:retry' }>[], records: unknown[] }> {
  const sink = memorySink()
  const retries: Extract<CrawlEvent, { type: 'request:retry' }>[] = []
  const crawler = createCrawler({ browser: browserConfig(), sink, dedupe: 'recipe', onEvent: (event) => { if (event.type === 'request:retry') retries.push(event) } })
  try {
    const report = await crawler.run(await loadRecipes([output, ...recipes]))

    return { report, retries, records: sink.records.map(({ data }) => data.text) }
  } finally {
    await crawler.close()
  }
}

describe('retrying requests that fail in passing', () => {
  it('reconnects after dropped connections, in api and web mode', async () => {
    const { report, retries, records } = await crawl([recipe('api-reset', 'api', 'key=api-reset&fail=2&mode=reset'), recipe('web-reset', 'web', 'key=web-reset&fail=2&mode=reset')])
    expect(report.recipes.map(entry => entry.error)).toEqual([undefined, undefined])
    expect(records).toEqual(['ok after 3', 'ok after 3'])
    expect(retries.filter(event => event.recipeId === 'api-reset').map(event => event.attempt)).toEqual([2, 3])
    // Chromium retries a reset GET once by itself, so the engine may see only one of the two failures.
    expect(retries.filter(event => event.recipeId === 'web-reset').length).toBeGreaterThanOrEqual(1)
  }, 60000)

  it('retries a 503, and waits as long as a 429 asks', async () => {
    const started = Date.now()
    const { report, retries } = await crawl([recipe('web-503', 'web', 'key=web-503&fail=1&mode=status'), recipe('api-429', 'api', 'key=api-429&fail=1&mode=retry-after')])
    expect(report.recipes.map(entry => [entry.emitted, entry.error])).toEqual([[1, undefined], [1, undefined]])
    expect(retries.map(event => [event.recipeId, event.reason, event.delayMs])).toEqual([['web-503', 'HTTP 503', expect.any(Number)], ['api-429', 'HTTP 429', 1000]])
    expect(Date.now() - started).toBeGreaterThanOrEqual(1000)
  }, 60000)

  it('gives up after the attempts allowed, with the last error', async () => {
    const { report, retries } = await crawl([recipe('once', 'api', 'key=once&fail=1&mode=status', { attempts: 1 }), recipe('twice', 'api', 'key=twice&fail=5&mode=status', { attempts: 2, backoffMs: 10 })])
    expect(report.recipes.map(entry => entry.error)).toEqual([expect.stringContaining('HTTP 503'), expect.stringContaining('HTTP 503')])
    expect(retries.map(event => event.recipeId)).toEqual(['twice'])
  }, 60000)
})
