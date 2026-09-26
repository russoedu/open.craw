import type { Server } from 'node:http'
import { createCrawler, loadRecipes } from '../src/index'
import { arrivals, FIXTURE_BASE, startFixtureSite, stopFixtureSite } from './fixture-site'

let site: Server
beforeAll(async () => { site = await startFixtureSite() })
afterAll(async () => { await stopFixtureSite(site) })

const output = { kind: 'output', id: 'item', version: 1, fields: { url: { type: 'url', key: true, required: true } } }

/** Reads a catalog page and fetches its products four at a time. */
function catalog (id: string, page: number): Record<string, unknown> {
  return {
    kind:   'input',
    id,
    output: 'item',
    mode:   'api',
    start:  [{ url: `${FIXTURE_BASE}/catalog?page=${page}` }],
    limits: { concurrency: 4 },
    steps:  [
      { type: 'request', url: '{{start.url}}', as: 'html' },
      { type: 'extract', id: 'links', selector: 'a.product', kind: 'css', take: 'attr:href', many: true },
      { type: 'forEach', over: 'links', as: 'link', emit: true, steps: [{ type: 'request', id: 'item', url: '{{link}}' }] },
    ],
    mapping: { url: { from: 'page.url' } },
  }
}

describe('per-site throttle (crawler-wide)', () => {
  it('spaces every request to the site across recipes and parallel iterations', async () => {
    arrivals.length = 0
    const crawler = createCrawler({ throttle: { domains: { '127.0.0.1': { delayMs: 120 } } } })
    try {
      const report = await crawler.run(await loadRecipes([output, catalog('first', 1), catalog('second', 2)]))
      expect(report.recipes.map(recipe => [recipe.recipeId, recipe.emitted, recipe.error])).toEqual([['first', 2, undefined], ['second', 2, undefined]])
    } finally {
      await crawler.close()
    }
    // Two catalog pages and four products, as the site saw them arrive.
    const times = arrivals.filter(({ path }) => path.startsWith('/catalog') || path.startsWith('/product/')).map(({ at }) => at)
    expect(times).toHaveLength(6)
    const gaps = times.slice(1).map((at, index) => at - times[index])
    // Unthrottled, these land within a few ms of each other. The site shares the test's event loop, so its
    // clock can run a little late under load: allow 40 ms of that.
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(80)
  }, 30000)
})
