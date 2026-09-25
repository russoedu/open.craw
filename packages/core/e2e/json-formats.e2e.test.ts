import type { Server } from 'node:http'
import { createCrawler, loadRecipes, memorySink } from '../src/index'
import { FIXTURE_BASE, startFixtureSite, stopFixtureSite } from './fixture-site'

let site: Server
beforeAll(async () => { site = await startFixtureSite() })
afterAll(async () => { await stopFixtureSite(site) })

const output = {
  kind:    'output',
  id:      'feed-product',
  version: 1,
  fields:  {
    sku:   { type: 'string', key: true, required: true },
    name:  { type: 'string', required: true },
    price: { type: 'number', required: true },
  },
}

const mapping = { sku: { from: 'item.sku' }, name: { from: 'item.name' }, price: { from: 'item.price' } }

const jsonLines = {
  kind:   'input',
  id:     'ndjson-export',
  output: 'feed-product',
  mode:   'api',
  start:  [{ url: `${FIXTURE_BASE}/products.jsonl` }],
  steps:  [
    { type: 'request', url: '{{start.url}}' },
    { type: 'extract', id: 'items', selector: '$[*]', kind: 'jsonpath', take: 'json', many: true },
    { type: 'forEach', over: 'items', as: 'item', emit: true, steps: [] },
  ],
  mapping,
}

const jsonp = {
  ...jsonLines,
  id:    'jsonp-endpoint',
  start: [{ url: `${FIXTURE_BASE}/legacy.js` }],
  steps: [
    { type: 'request', url: '{{start.url}}', as: 'json' },
    { type: 'extract', id: 'items', selector: '$.items[*]', kind: 'jsonpath', take: 'json', many: true },
    { type: 'forEach', over: 'items', as: 'item', emit: true, steps: [] },
  ],
}

describe('json formats (NDJSON by content type, JSONP read as JSON)', () => {
  it('reads a JSON Lines export as an array and unwraps a JSONP callback', async () => {
    const sink = memorySink()
    const crawler = createCrawler({ sink })
    try {
      const report = await crawler.run(await loadRecipes([output, jsonLines, jsonp]))
      expect(report.recipes.map(recipe => [recipe.recipeId, recipe.emitted, recipe.rejected])).toEqual([['ndjson-export', 2, 0], ['jsonp-endpoint', 1, 0]])
      expect(sink.records.map(({ data }) => data)).toEqual([
        { sku: 'P-1', name: 'Pandina', price: 15_950 },
        { sku: 'P-2', name: '600e', price: 36_950 },
        { sku: 'J-1', name: 'Avenger', price: 24_950 },
      ])
    } finally {
      await crawler.close()
    }
  })
})
