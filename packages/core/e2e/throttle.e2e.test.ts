import type { Server } from 'node:http'
import { createCrawler, loadRecipes } from '../src/index'
import type { CrawlEvent } from '../src/index'
import { FIXTURE_BASE, startFixtureSite, stopFixtureSite } from './fixture-site'

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
    const visits: number[] = []
    const onEvent = (event: CrawlEvent): void => { if (event.type === 'page:visit') visits.push(Date.parse(event.at)) }
    const crawler = createCrawler({ throttle: { domains: { '127.0.0.1': { delayMs: 120 } } }, onEvent })
    try {
      const report = await crawler.run(await loadRecipes([output, catalog('first', 1), catalog('second', 2)]))
      expect(report.recipes.map(recipe => [recipe.recipeId, recipe.emitted, recipe.error])).toEqual([['first', 2, undefined], ['second', 2, undefined]])
    } finally {
      await crawler.close()
    }
    expect(visits).toHaveLength(6)
    const sorted = [...visits].sort((first, second) => first - second)
    const gaps = sorted.slice(1).map((at, index) => at - sorted[index])
    // A visit is reported when its response arrives: starts are 120 ms apart, arrivals too give or take the fixture's jitter.
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(60)
    expect(sorted.at(-1)! - sorted[0]).toBeGreaterThanOrEqual(5 * 120 - 30)
  }, 30000)
})
