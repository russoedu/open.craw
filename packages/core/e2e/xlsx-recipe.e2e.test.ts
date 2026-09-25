import type { Server } from 'node:http'
import { createCrawler, loadRecipes, memorySink } from '../src/index'
import { FIXTURE_BASE, startFixtureSite, stopFixtureSite } from './fixture-site'

let site: Server
beforeAll(async () => { site = await startFixtureSite() })
afterAll(async () => { await stopFixtureSite(site) })

const output = {
  kind:    'output',
  id:      'dealer-incentive',
  version: 1,
  fields:  {
    brand:     { type: 'string', key: true, required: true },
    model:     { type: 'string', key: true, required: true },
    listPrice: { type: 'number', required: true },
    netPrice:  { type: 'number', nullable: true },
    discount:  { type: 'number', nullable: true },
    validFrom: { type: 'date', nullable: true },
    active:    { type: 'boolean', nullable: true },
  },
}

const input = {
  kind:   'input',
  id:     'incentive-workbook',
  output: 'dealer-incentive',
  mode:   'api',
  start:  [{ url: `${FIXTURE_BASE}/incentivi.xlsx` }],
  steps:  [
    { type: 'request', url: '{{start.url}}' },
    {
      type:       'extract',
      id:         'table',
      kind:       'table',
      sheet:      '^Incentivi',
      selector:   '^Marca Modello',
      headerRows: 2,
      until:      '^Consegna',
      columns:    { brand: '^Marca$', model: '^Modello$', list: '^Prezzo Listino$', net: '^Prezzo Netto$', discount: '^Sconto$', from: '^Valido', active: '^Attivo$' },
    },
    { type: 'set', id: 'rows', value: '{{table.rows}}' },
    { type: 'forEach', over: 'rows', as: 'row', emit: true, steps: [] },
  ],
  mapping: {
    brand:     { from: 'row.brand' },
    model:     { from: 'row.model' },
    listPrice: { from: 'row.list' },
    netPrice:  { from: 'row.net', transform: [{ op: 'default', value: null }] },
    discount:  { from: 'row.discount', transform: [{ op: 'default', value: null }] },
    validFrom: { from: 'row.from', transform: [{ op: 'default', value: null }] },
    active:    { from: 'row.active', transform: [{ op: 'default', value: null }] },
  },
}

describe('xlsx recipe (an incentive workbook served as a spreadsheet)', () => {
  it('reads the table under its two-row merged header: the brand merged down its models, the hidden row skipped, numbers as numbers', async () => {
    const sink = memorySink()
    const crawler = createCrawler({ sink })
    try {
      const report = await crawler.run(await loadRecipes([output, input]))
      expect(report.recipes[0]).toMatchObject({ recipeId: 'incentive-workbook', emitted: 3, rejected: 0 })
      expect(sink.records.map(({ data }) => data)).toEqual([
        { brand: 'Fiat', model: 'Pandina', listPrice: 15_950, netPrice: 13_955.625, discount: 0.125, validFrom: '2026-06-01', active: true },
        { brand: 'Fiat', model: 'Pandina Cross', listPrice: 17_950, netPrice: 15_706.25, discount: 0.125, validFrom: '2026-06-01', active: false },
        { brand: 'Jeep', model: 'Avenger', listPrice: 24_950.5, netPrice: null, discount: null, validFrom: null, active: null },
      ])
    } finally {
      await crawler.close()
    }
  })
})
