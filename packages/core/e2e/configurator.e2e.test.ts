import type { Server } from 'node:http'
import { join } from 'node:path'
import { createCrawler, loadRecipeSet, memorySink } from '../src/index'
import { browserConfig, startFixtureSite, stopFixtureSite, TRIMS } from './fixture-site'

let site: Server
beforeAll(async () => { site = await startFixtureSite() })
afterAll(async () => { await stopFixtureSite(site) })

const recipesDir = join(__dirname, 'recipes', 'configurator')

describe('forEach over live elements (real chromium)', () => {
  it('drives a <select> option by option and emits one record per re-render', async () => {
    const recipes = await loadRecipeSet({ output: join(recipesDir, 'trim.output.json'), inputs: [join(recipesDir, 'configurator-web.input.json')] })
    const sink = memorySink()
    const crawler = createCrawler({ browser: browserConfig(), sink })
    try {
      const report = await crawler.run(recipes)
      expect(report.recipes[0].error).toBeUndefined()
      expect(report.recipes[0]).toMatchObject({ emitted: 3, rejected: 0, pages: 1 })
      expect(sink.records.map(record => record.data)).toEqual(TRIMS.map(([code, trim, price]) => ({
        model: 'Model X',
        trim,
        code,
        price: { amount: Number(price.replace('.', '').replace(' €', '')), currency: 'EUR' },
      })))
    } finally {
      await crawler.close()
    }
  }, 120000)
})
