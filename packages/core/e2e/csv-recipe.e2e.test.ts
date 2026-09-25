import type { Server } from 'node:http'
import { createCrawler, loadRecipes, memorySink } from '../src/index'
import { FIXTURE_BASE, startFixtureSite, stopFixtureSite } from './fixture-site'

let site: Server
beforeAll(async () => { site = await startFixtureSite() })
afterAll(async () => { await stopFixtureSite(site) })

const output = {
  kind:    'output',
  id:      'list-price',
  version: 1,
  fields:  {
    brand:   { type: 'string', key: true, required: true },
    model:   { type: 'string', key: true, required: true },
    version: { type: 'string', key: true, required: true },
    price:   { type: 'number', required: true },
    source:  { type: 'url', generated: 'sourceUrl' },
  },
}

const input = {
  kind:   'input',
  id:     'price-list',
  output: 'list-price',
  mode:   'api',
  start:  [{ url: `${FIXTURE_BASE}/listino.csv` }],
  steps:  [
    { type: 'request', url: '{{start.url}}' },
    { type: 'extract', id: 'table', selector: '^Marca Modello', kind: 'table', until: '^Totale', fillDown: ['brand', 'model'], columns: { brand: '^Marca$', model: '^Modello$', version: '^Versione$', price: '^Prezzo' } },
    { type: 'set', id: 'rows', value: '{{table.rows}}' },
    { type: 'forEach', over: 'rows', as: 'row', emit: true, steps: [] },
  ],
  mapping: {
    brand:   { from: 'row.brand' },
    model:   { from: 'row.model' },
    version: { from: 'row.version', transform: [{ op: 'replace', pattern: String.raw`\s+`, replacement: ' ', flags: 'g' }] },
    price:   { from: 'row.price', transform: [{ op: 'number', locale: 'it-IT' }] },
  },
}

describe('csv recipe (a Windows-1252, semicolon-separated price list served as text/csv)', () => {
  it('reads the list into records: encoding and delimiter detected, the model written once filled down', async () => {
    const sink = memorySink()
    const crawler = createCrawler({ sink })
    try {
      const report = await crawler.run(await loadRecipes([output, input]))
      expect(report.recipes[0]).toMatchObject({ recipeId: 'price-list', emitted: 4, rejected: 0 })
      const source = `${FIXTURE_BASE}/listino.csv`
      expect(sink.records.map(({ data }) => data)).toEqual([
        { brand: 'Fiat', model: 'Pandina', version: '1.0 Hybrid "Cross"', price: 15_950, source },
        { brand: 'Fiat', model: 'Pandina', version: '1.0 Hybrid Icon', price: 16_450, source },
        { brand: 'Citroën', model: 'C3', version: 'Plus; automatica nuova', price: 19_300, source },
        { brand: 'Peugeot', model: '208', version: 'Allure', price: 21_450, source },
      ])
    } finally {
      await crawler.close()
    }
  })
})
