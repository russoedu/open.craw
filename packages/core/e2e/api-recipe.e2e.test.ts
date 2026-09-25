import type { Server } from 'node:http'
import { join } from 'node:path'
import { createCrawler, loadRecipeSet, memorySink } from '../src/index'
import { browserConfig, expectedRecords, startFixtureSite, stopFixtureSite } from './fixture-site'

let site: Server
beforeAll(async () => { site = await startFixtureSite() })
afterAll(async () => { await stopFixtureSite(site) })

describe('api recipe (browser bootstrap, then HTTP only)', () => {
  it('logs in through the browser, hands the cookie to the API context and pages through the JSON', async () => {
    const recipes = await loadRecipeSet({ output: join(__dirname, 'recipes', 'product.output.json'), inputs: [join(__dirname, 'recipes', 'shop-api.input.json')] })
    const sink = memorySink()
    const crawler = createCrawler({ browser: browserConfig(), sink, hooks: { positive: (input: unknown) => Number(input) > 0 } })
    try {
      const report = await crawler.run(recipes)
      expect(report.recipes[0].error).toBeUndefined()
      // 3 API pages plus the login page the bootstrap visited
      expect(report.recipes[0]).toMatchObject({ recipeId: 'shop-api', mode: 'api', emitted: 6, rejected: 0, pages: 4 })
      const records = sink.records.map(({ data: { scrapedAt: _at, ...rest } }) => rest).sort((a, b) => String(a.url).localeCompare(String(b.url)))
      expect(records).toEqual(expectedRecords())
    } finally {
      await crawler.close()
    }
  }, 120000)

  it('fails the recipe, not the process, when the API refuses without the cookie', async () => {
    const recipes = await loadRecipeSet({ output: join(__dirname, 'recipes', 'product.output.json'), inputs: [join(__dirname, 'recipes', 'shop-api.input.json')] })
    const noLogin = { ...recipes.inputs[0], session: undefined }
    const crawler = createCrawler({ browser: browserConfig(), hooks: { positive: () => true } })
    try {
      const report = await crawler.run({ output: recipes.output, inputs: [noLogin] })
      expect(report.recipes[0].error).toContain('HTTP 401')
      expect(report.records).toBe(0)
    } finally {
      await crawler.close()
    }
  }, 60000)
})
