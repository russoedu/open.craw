import type { Server } from 'node:http'
import { createCrawler, loadRecipes, memorySink } from '../src/index'
import { FIXTURE_BASE, startFixtureSite, stopFixtureSite } from './fixture-site'

let site: Server
beforeAll(async () => { site = await startFixtureSite() })
afterAll(async () => { await stopFixtureSite(site) })

const output = {
  kind:    'output',
  id:      'catalogue-model',
  version: 1,
  fields:  {
    brand:  { type: 'string', key: true, required: true },
    model:  { type: 'string', key: true, required: true },
    price:  { type: 'number', required: true },
    market: { type: 'string', required: true },
  },
}

const input = {
  kind:   'input',
  id:     'yaml-catalogue',
  output: 'catalogue-model',
  mode:   'api',
  start:  [{ url: `${FIXTURE_BASE}/catalogue.yaml` }],
  steps:  [
    { type: 'request', url: '{{start.url}}' },
    { type: 'extract', id: 'models', selector: '$.models[*]', kind: 'jsonpath', take: 'json', many: true },
    { type: 'forEach', over: 'models', as: 'model', emit: true, steps: [] },
  ],
  mapping: {
    brand:  { from: 'model.brand' },
    model:  { from: 'model.name' },
    price:  { from: 'model.price' },
    market: { from: 'model.market' },
  },
}

describe('yaml recipe (a CMS export served as application/yaml)', () => {
  it('reads it as data: merge keys applied, YAML 1.2 keeping NO as text', async () => {
    const sink = memorySink()
    const crawler = createCrawler({ sink })
    try {
      const report = await crawler.run(await loadRecipes([output, input]))
      expect(report.recipes[0]).toMatchObject({ recipeId: 'yaml-catalogue', emitted: 3, rejected: 0 })
      expect(sink.records.map(({ data }) => data)).toEqual([
        { brand: 'Fiat', model: 'Pandina', price: 15_950, market: 'NO' },
        { brand: 'Fiat', model: '600e', price: 36_950, market: 'NO' },
        { brand: 'Jeep', model: 'Avenger', price: 24_950, market: 'NO' },
      ])
    } finally {
      await crawler.close()
    }
  })
})
