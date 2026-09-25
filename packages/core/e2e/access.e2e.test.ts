import type { Server } from 'node:http'
import { join } from 'node:path'
import { createCrawler, loadRecipeSet, memorySink, RecipeSet } from '../src/index'
import type { AccessConfig, CrawlEvent } from '../src/index'
import { browserConfig, expectedRecords, FIXTURE_PORT, startFixtureSite, stopFixtureSite } from './fixture-site'
import { PROXY_PORT, startForwardProxy, stopForwardProxy } from './forward-proxy'
import type { ForwardProxy } from './forward-proxy'

const PASSWORD = 'e2e-secret'
const recipes = join(__dirname, 'recipes')

let site: Server
let proxy: ForwardProxy
beforeAll(async () => {
  process.env.OPEN_CRAW_E2E_PROXY_PASSWORD = PASSWORD
  site = await startFixtureSite()
  proxy = await startForwardProxy(PASSWORD)
})
afterAll(async () => {
  await stopForwardProxy(proxy)
  await stopFixtureSite(site)
})
beforeEach(() => { proxy.hits.length = 0 })

function access (extra: Record<string, unknown> = {}): AccessConfig {
  return {
    profiles: {
      local: { kind: 'proxy', server: `http://127.0.0.1:${PROXY_PORT}`, username: 'tester-{{session}}', password: '{{env.OPEN_CRAW_E2E_PROXY_PASSWORD}}', session: { idFormat: 'alnum8' }, ...extra },
    },
    default: 'local',
  }
}

function stripDates (records: { data: Record<string, unknown> }[]): Record<string, unknown>[] {
  return records.map(({ data: { scrapedAt: _at, ...rest } }) => rest).sort((a, b) => String(a.url).localeCompare(String(b.url)))
}

describe('access profiles (real chromium, local forward proxy)', () => {
  it('sends every page of a web recipe through the proxy with one sticky session, and skips blocked resources', async () => {
    const set = await loadRecipeSet({ output: join(recipes, 'product.output.json'), inputs: [join(recipes, 'shop-web.input.json')] })
    const sink = memorySink()
    const events: CrawlEvent[] = []
    const crawler = createCrawler({ browser: browserConfig(), sink, access: access({ blockResources: ['image'] }), onEvent: (event) => { events.push(event) } })
    try {
      const report = await crawler.run(set)
      expect(report.recipes[0].error).toBeUndefined()
      expect(stripDates(sink.records)).toEqual(expectedRecords())
    } finally {
      await crawler.close()
    }
    const lease = events.find(event => event.type === 'access:lease')
    expect(lease).toMatchObject({ profile: 'local', kind: 'proxy', server: `http://127.0.0.1:${PROXY_PORT}` })
    const session = lease?.type === 'access:lease' ? lease.session : undefined
    expect(session).toMatch(/^[a-z0-9]{8}$/)
    expect(new Set(proxy.hits.map(hit => hit.username))).toEqual(new Set([`tester-${session}`]))
    expect(proxy.hits.some(hit => hit.url.includes('/catalog?page=1'))).toBe(true)
    expect(proxy.hits.filter(hit => hit.url.includes('/product/'))).toHaveLength(6)
    expect(proxy.hits.some(hit => hit.url.includes('/img/'))).toBe(false)
  }, 120000)

  it('uses one lease for the browser bootstrap and the HTTP requests after it', async () => {
    const set = await loadRecipeSet({ output: join(recipes, 'product.output.json'), inputs: [join(recipes, 'shop-api.input.json')] })
    const sink = memorySink()
    const crawler = createCrawler({ browser: browserConfig(), sink, access: access(), hooks: { positive: (input: unknown) => Number(input) > 0 } })
    try {
      const report = await crawler.run(set)
      expect(report.recipes[0].error).toBeUndefined()
      expect(stripDates(sink.records)).toEqual(expectedRecords())
    } finally {
      await crawler.close()
    }
    // The browser bootstrap sends plain proxy requests; Playwright's HTTP context tunnels even http:// through CONNECT.
    expect(proxy.hits.some(hit => hit.method === 'GET' && hit.url.endsWith('/login'))).toBe(true)
    expect(proxy.hits.some(hit => hit.method === 'CONNECT' && hit.url === `127.0.0.1:${FIXTURE_PORT}`)).toBe(true)
    expect(new Set(proxy.hits.map(hit => hit.username)).size).toBe(1)
  }, 120000)

  it('fails the recipe, naming the variable, when a credential is not in the environment', async () => {
    const set = await loadRecipeSet({ output: join(recipes, 'product.output.json'), inputs: [join(recipes, 'shop-web.input.json')] })
    const crawler = createCrawler({ browser: browserConfig(), access: access({ password: '{{env.OPEN_CRAW_E2E_UNSET}}' }) })
    try {
      const report = await crawler.run(set)
      expect(report.recipes[0].error).toContain('needs the environment variable OPEN_CRAW_E2E_UNSET')
      expect(proxy.hits).toHaveLength(0)
    } finally {
      await crawler.close()
    }
  }, 60000)

  it('rotates to a new session when the first one is blocked, and finishes the crawl', async () => {
    const set = await loadRecipeSet({ output: join(recipes, 'product.output.json'), inputs: [join(recipes, 'shop-web.input.json')] })
    const input = { ...set.inputs[0], session: { ...set.inputs[0].session, onBlock: { rotate: true, attempts: 2 } } }
    const sink = memorySink()
    const events: CrawlEvent[] = []
    const crawler = createCrawler({ browser: browserConfig(), sink, access: access(), onEvent: (event) => { events.push(event) } })
    proxy.blockNextUser()
    try {
      const report = await crawler.run(new RecipeSet(set.output, [input]))
      expect(report.recipes[0].error).toBeUndefined()
      expect(stripDates(sink.records)).toEqual(expectedRecords())
    } finally {
      await crawler.close()
    }
    const leases = events.flatMap(event => (event.type === 'access:lease' ? [event.session] : []))
    expect(leases).toHaveLength(2)
    expect(leases[0]).not.toBe(leases[1])
    expect(events.filter(event => event.type === 'access:blocked')).toEqual([expect.objectContaining({ status: 403, url: expect.stringContaining('/catalog?page=1') as unknown as string })])
    expect(events.filter(event => event.type === 'access:rotate')).toEqual([expect.objectContaining({ attempt: 2 })])
    // The blocked session got the refused catalog page (and Chromium's own favicon request), never a product page.
    const blockedHits = proxy.hits.filter(hit => hit.username === `tester-${leases[0]}`)
    expect(blockedHits.some(hit => hit.url.includes('/catalog?page=1'))).toBe(true)
    expect(blockedHits.some(hit => hit.url.includes('/product/'))).toBe(false)
  }, 120000)

  it('fails the recipe with the block, not a later selector miss, when it may not rotate', async () => {
    const set = await loadRecipeSet({ output: join(recipes, 'product.output.json'), inputs: [join(recipes, 'shop-web.input.json')] })
    const crawler = createCrawler({ browser: browserConfig(), access: access() })
    proxy.blockNextUser()
    try {
      const report = await crawler.run(set)
      expect(report.recipes[0].error).toContain(`blocked at http://127.0.0.1:${FIXTURE_PORT}/catalog?page=1: HTTP 403`)
    } finally {
      await crawler.close()
    }
  }, 60000)
})
