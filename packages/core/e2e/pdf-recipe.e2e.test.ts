import type { Server } from 'node:http'
import { createCrawler, loadRecipes, memorySink } from '../src/index'
import { FIXTURE_BASE, startFixtureSite, stopFixtureSite } from './fixture-site'

let site: Server
beforeAll(async () => { site = await startFixtureSite() })
afterAll(async () => { await stopFixtureSite(site) })

const output = {
  kind:    'output',
  id:      'dealer-discount',
  version: 1,
  fields:  {
    month:           { type: 'string', key: true, required: true },
    brand:           { type: 'string', key: true, required: true },
    model:           { type: 'string', key: true, required: true },
    discountPercent: { type: 'number', nullable: true },
    extra:           { type: 'string', nullable: true },
    source:          { type: 'url', generated: 'sourceUrl' },
  },
}

const input = {
  kind:   'input',
  id:     'discount-sheet',
  output: 'dealer-discount',
  mode:   'api',
  start:  [{ url: `${FIXTURE_BASE}/discounts.pdf`, vars: { month: '2026-09' } }],
  steps:  [
    { type: 'request', id: 'sheet', url: '{{start.url}}', as: 'pdf' },
    { type: 'extract', id: 'tables', selector: '^MODELS', kind: 'table', many: true, until: String.raw`^(NOTE|\*)`, columns: { model: '^MODELS', discount: String.raw`^(Discount|\(PROMO)`, extra: '^Extra' } },
    {
      type:  'forEach',
      over:  'tables',
      as:    'table',
      steps: [
        { type: 'set', id: 'rows', value: '{{table.rows}}' },
        { type: 'forEach', over: 'rows', as: 'row', emit: true, steps: [] },
      ],
    },
  ],
  mapping: {
    month:           { from: 'vars.month' },
    brand:           { from: 'table.title', transform: [{ op: 'regex', pattern: String.raw`^MODELS\s+(\w+)` }] },
    model:           { from: 'row.model' },
    discountPercent: { from: 'row.discount', transform: [{ op: 'regex', pattern: String.raw`(\d+(?:[,.]\d+)?)\s?%` }, { op: 'number', locale: 'it-IT' }] },
    extra:           { from: 'row.extra', transform: [{ op: 'default', value: null }] },
  },
}

describe('pdf recipe (a discount sheet served as application/pdf)', () => {
  it('reads every table of the sheet into records', async () => {
    const sink = memorySink()
    const crawler = createCrawler({ sink })
    try {
      const report = await crawler.run(await loadRecipes([output, input]))
      expect(report.recipes[0]).toMatchObject({ recipeId: 'discount-sheet', emitted: 12, rejected: 0 })
      const records = sink.records.map(({ data }) => data)
      expect(records.slice(0, 3)).toEqual([
        { month: '2026-09', brand: 'ALPHA', model: 'CITY (model 101)', discountPercent: 19, extra: '+3% registration bonus', source: `${FIXTURE_BASE}/discounts.pdf` },
        { month: '2026-09', brand: 'ALPHA', model: 'CITY EV (model 102)', discountPercent: 3, extra: null, source: `${FIXTURE_BASE}/discounts.pdf` },
        { month: '2026-09', brand: 'ALPHA', model: 'MINI (model 103)', discountPercent: 0, extra: '1000 euro scrappage bonus', source: `${FIXTURE_BASE}/discounts.pdf` },
      ])
      expect(records.map(record => `${String(record.brand)} ${String(record.model)} ${String(record.discountPercent)}`)).toEqual(expect.arrayContaining([
        'ALPHA WAGON base series 1 (104.E23 without OPT JFS-JFR) 12',
        'BETA VAN 18.5',
        'DELTA TRUCK 290 18',
        'GAMMA G3 BEV 5',
      ]))
    } finally {
      await crawler.close()
    }
  }, 60000)
})
