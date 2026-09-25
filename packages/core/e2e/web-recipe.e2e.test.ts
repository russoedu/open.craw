import type { Server } from 'node:http'
import { join } from 'node:path'
import { createCrawler, loadRecipeSet, memorySink } from '../src/index'
import type { CrawlEvent } from '../src/index'
import { browserConfig, expectedRecords, startFixtureSite, stopFixtureSite } from './fixture-site'

let site: Server
beforeAll(async () => { site = await startFixtureSite() })
afterAll(async () => { await stopFixtureSite(site) })

describe('web recipe (real chromium)', () => {
  it('paginates the catalog, visits every product and emits validated records', async () => {
    const recipes = await loadRecipeSet({ output: join(__dirname, 'recipes', 'product.output.json'), inputs: [join(__dirname, 'recipes', 'shop-web.input.json')] })
    const sink = memorySink()
    const events: CrawlEvent[] = []
    const crawler = createCrawler({ browser: browserConfig(), sink, onEvent: (event) => { events.push(event) } })
    try {
      const report = await crawler.run(recipes)
      expect(report.recipes[0].error).toBeUndefined()
      expect(report.records).toBe(6)
      expect(report.recipes[0]).toMatchObject({ recipeId: 'shop-web', mode: 'web', emitted: 6, rejected: 0, duplicates: 0 })
      // the first catalog page, 6 product pages, 2 next-page clicks
      expect(report.recipes[0].pages).toBe(9)
      const records = sink.records.map(record => record.data).map(({ scrapedAt, ...rest }) => {
        expect(typeof scrapedAt).toBe('string')

        return rest
      }).sort((a, b) => String(a.url).localeCompare(String(b.url)))
      expect(records).toEqual(expectedRecords())
      expect(events.filter(event => event.type === 'step:skip')).toHaveLength(3)
      // the consent wall is up on the first catalog page only; the cookie set by the click hides it on pages 2 and 3
      expect(events.flatMap(event => (event.type === 'step:branch' ? [event.branch] : []))).toEqual(['then', 'else', 'else'])
    } finally {
      await crawler.close()
    }
  }, 120000)
})
