import type { Server } from 'node:http'
import { createCrawler, loadRecipes, memorySink } from '../src/index'
import { FIXTURE_BASE, startFixtureSite, stopFixtureSite } from './fixture-site'

let site: Server
beforeAll(async () => { site = await startFixtureSite() })
afterAll(async () => { await stopFixtureSite(site) })

const output = {
  kind:    'output',
  id:      'circular-price',
  version: 1,
  fields:  {
    model:      { type: 'string', key: true, required: true },
    list:       { type: 'number', required: true },
    net:        { type: 'number', required: true },
    conditions: { type: 'array', items: { type: 'string' } },
    pricelist:  { type: 'url', required: true },
  },
}

/** A price circular in Word: the table under "Prezzi", the conditions' bullets, the price list's link. */
const circular = {
  kind:   'input',
  id:     'circular',
  output: 'circular-price',
  mode:   'api',
  start:  [{ url: `${FIXTURE_BASE}/circolare.docx` }],
  steps:  [
    { type: 'request', url: '{{start.url}}' },
    { type: 'extract', id: 'conditions', selector: "section[data-heading='Condizioni'] ul > li", kind: 'css', many: true },
    { type: 'extract', id: 'pricelist', selector: "a[href$='.pdf']", kind: 'css', take: 'attr:href' },
    { type: 'extract', id: 'prices', selector: '^Modello', kind: 'table', headerRows: 2, columns: { model: '^Modello$', list: 'Listino', net: 'Netto' } },
    { type: 'set', id: 'rows', value: '{{prices.rows}}' },
    { type: 'forEach', over: 'rows', as: 'row', emit: true, steps: [] },
  ],
  mapping: {
    model:      { from: 'row.model' },
    list:       { from: 'row.list', transform: [{ op: 'number', locale: 'it-IT' }] },
    net:        { from: 'row.net', transform: [{ op: 'number', locale: 'it-IT' }] },
    conditions: { from: 'conditions' },
    pricelist:  { from: 'pricelist' },
  },
}

describe('Word documents', () => {
  it('reads a circular: its table with a two-row merged header, its bullets and its links', async () => {
    const sink = memorySink()
    const crawler = createCrawler({ sink })
    try {
      const report = await crawler.run(await loadRecipes([output, circular]))
      expect(report.recipes[0].error).toBeUndefined()
    } finally {
      await crawler.close()
    }
    const conditions = ['Solo rottamazione', 'Non cumulabile']
    const pricelist = 'https://example.com/listino-giugno.pdf'
    expect(sink.records.map(({ data: { scrapedAt: _at, ...rest } }) => rest)).toEqual([
      { model: 'Pandina', list: 15_950, net: 13_955, conditions, pricelist },
      { model: '600e', list: 36_950, net: 32_950, conditions, pricelist },
    ])
  })
})
