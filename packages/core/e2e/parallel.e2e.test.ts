import type { Server } from 'node:http'
import { createCrawler, loadRecipes, memorySink } from '../src/index'
import type { CrawlReport } from '../src/index'
import { browserConfig, FIXTURE_BASE, slowLoad, startFixtureSite, stopFixtureSite } from './fixture-site'

let site: Server
beforeAll(async () => { site = await startFixtureSite() })
afterAll(async () => { await stopFixtureSite(site) })

const output = { kind: 'output', id: 'item', version: 1, fields: { title: { type: 'string', key: true, required: true } } }

/** The six slow pages of the listing, `concurrency` at a time. */
function items (id: string, mode: 'web' | 'api', concurrency: number): Record<string, unknown> {
  const open = mode === 'web' ? { type: 'goto', url: '{{start.url}}' } : { type: 'request', url: '{{start.url}}', as: 'html' }
  const visit = mode === 'web' ? { type: 'goto', url: '{{link}}' } : { type: 'request', url: '{{link}}', as: 'html' }

  return {
    kind:   'input',
    id,
    output: 'item',
    mode,
    start:  [{ url: `${FIXTURE_BASE}/slow` }],
    limits: { concurrency },
    steps:  [
      open,
      { type: 'extract', id: 'links', selector: 'a.item', kind: 'css', take: 'attr:href', many: true },
      { type: 'forEach', over: 'links', as: 'link', emit: true, steps: [visit, { type: 'extract', id: 'title', selector: 'h1', kind: 'css' }] },
    ],
    mapping: { title: { from: 'title' } },
  }
}

/** Runs the recipes and reports the most slow pages the site served at once. */
async function crawl (recipes: unknown[], parallel?: number): Promise<{ report: CrawlReport, titles: string[], peak: number }> {
  const sink = memorySink()
  const crawler = createCrawler({ browser: browserConfig(), sink, dedupe: 'recipe', parallel })
  slowLoad.peak = 0
  try {
    const report = await crawler.run(await loadRecipes([output, ...recipes]))

    return { report, titles: sink.records.map(({ data }) => String(data.title)).sort((first, second) => first.localeCompare(second)), peak: slowLoad.peak }
  } finally {
    await crawler.close()
  }
}

const SIX = ['Item 1', 'Item 2', 'Item 3', 'Item 4', 'Item 5', 'Item 6']

describe('parallel execution', () => {
  it('runs web iterations in tabs of their own, three at a time', async () => {
    const { report, titles, peak } = await crawl([items('web', 'web', 3)])
    expect([report.recipes[0].emitted, report.recipes[0].error]).toEqual([6, undefined])
    expect(titles).toEqual(SIX)
    // Each page takes 300 ms to serve: three tabs keep three in flight, never more.
    expect(peak).toBe(3)
    const sequential = await crawl([items('web-one', 'web', 1)])
    expect([sequential.report.recipes[0].emitted, sequential.peak]).toEqual([6, 1])
  }, 60000)

  it('runs the recipes of a set side by side, and reports them in the set order', async () => {
    const { report, titles, peak } = await crawl([items('first', 'api', 1), items('second', 'api', 1), items('third', 'web', 1)], 3)
    expect(report.recipes.map(recipe => [recipe.recipeId, recipe.emitted, recipe.error])).toEqual([['first', 6, undefined], ['second', 6, undefined], ['third', 6, undefined]])
    expect(titles).toHaveLength(18)
    // Each recipe is sequential inside; side by side, their pages overlap.
    expect(peak).toBeGreaterThanOrEqual(2)
    expect(peak).toBeLessThanOrEqual(3)
  }, 60000)
})
