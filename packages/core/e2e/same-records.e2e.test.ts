import type { Server } from 'node:http'
import { join } from 'node:path'
import { createCrawler, loadRecipeSet, memorySink } from '../src/index'
import { browserConfig, startFixtureSite, stopFixtureSite } from './fixture-site'

let site: Server
beforeAll(async () => { site = await startFixtureSite() })
afterAll(async () => { await stopFixtureSite(site) })

const recipesDir = join(__dirname, 'recipes')

describe('one output, two inputs', () => {
  it('runs both recipes in sequence and drops the second recipe\'s records as duplicates', async () => {
    const recipes = await loadRecipeSet({ output: join(recipesDir, 'product.output.json'), inputs: [recipesDir] })
    expect(recipes.inputs.map(input => input.id)).toEqual(['shop-api', 'shop-web'])
    const sink = memorySink()
    const crawler = createCrawler({ browser: browserConfig(), sink, hooks: { positive: (input: unknown) => Number(input) > 0 } })
    try {
      const report = await crawler.run(recipes)
      expect(report.recipes.map(recipe => [recipe.recipeId, recipe.emitted, recipe.duplicates])).toEqual([['shop-api', 6, 0], ['shop-web', 0, 6]])
      expect(report.records).toBe(6)
      expect(report.sink.written).toBe(6)
    } finally {
      await crawler.close()
    }
  }, 180000)

  it('keeps both sets under recipe-scoped de-duplication, and they are identical', async () => {
    const recipes = await loadRecipeSet({ output: join(recipesDir, 'product.output.json'), inputs: [recipesDir] })
    const sink = memorySink()
    const crawler = createCrawler({ browser: browserConfig(), sink, dedupe: 'recipe', hooks: { positive: (input: unknown) => Number(input) > 0 } })
    try {
      const report = await crawler.run(recipes)
      expect(report.records).toBe(12)
      const strip = (recipeId: string): Record<string, unknown>[] => sink.records
        .filter(record => record.source.recipeId === recipeId)
        .map(({ data: { scrapedAt: _at, ...rest } }) => rest)
        .sort((a, b) => String(a.url).localeCompare(String(b.url)))
      expect(strip('shop-web')).toEqual(strip('shop-api'))
    } finally {
      await crawler.close()
    }
  }, 180000)
})
