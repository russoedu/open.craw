import type { Server } from 'node:http'
import { createCrawler, loadRecipes, memorySink } from '../src/index'
import { FIXTURE_BASE, startFixtureSite, stopFixtureSite } from './fixture-site'

let site: Server
beforeAll(async () => { site = await startFixtureSite() })
afterAll(async () => { await stopFixtureSite(site) })

const output = {
  kind:    'output',
  id:      'deck-price',
  version: 1,
  fields:  {
    slide:    { type: 'string', key: true, required: true },
    model:    { type: 'string', key: true, required: true },
    price:    { type: 'number', required: true },
    discount: { type: 'number', required: true },
    note:     { type: 'string', nullable: true },
  },
}

const each = (steps: unknown[]): unknown[] => [
  { type: 'request', url: '{{start.url}}' },
  ...steps,
  { type: 'set', id: 'rows', value: '{{table.rows}}' },
  { type: 'forEach', over: 'rows', as: 'row', emit: true, steps: [] },
]

const nativeTable = {
  kind:   'input',
  id:     'deck-table',
  output: 'deck-price',
  mode:   'api',
  start:  [{ url: `${FIXTURE_BASE}/incentivi.pptx` }],
  steps:  each([
    { type: 'extract', id: 'note', selector: String.raw`Notes: ([^\n]+)`, kind: 'regex' },
    { type: 'extract', id: 'table', kind: 'table', slide: '^Incentivi', selector: '^Modello Prezzo', headerRows: 2, columns: { model: '^Modello$', price: '^Prezzo Listino$', discount: '^Sconto$' } },
  ]),
  mapping: {
    slide:    { from: 'table.slideTitle' },
    model:    { from: 'row.model' },
    price:    { from: 'row.price', transform: [{ op: 'number', locale: 'it-IT' }] },
    discount: { from: 'row.discount', transform: [{ op: 'number', locale: 'it-IT' }] },
    note:     { from: 'note' },
  },
}

const textBoxes = {
  ...nativeTable,
  id:      'deck-grid',
  steps:   each([{ type: 'extract', id: 'table', kind: 'table', shapes: true, slide: '^Griglia', selector: '^Modello Prezzo', columns: { model: '^Modello', price: '^Prezzo', discount: '^Sconto' } }]),
  mapping: { ...nativeTable.mapping, note: { from: 'row.note', transform: [{ op: 'default', value: null }] } },
}

describe('pptx recipe (a dealer deck served as a presentation)', () => {
  it('reads a native table under its merged header, and a price grid of grouped text boxes', async () => {
    const sink = memorySink()
    const crawler = createCrawler({ sink })
    try {
      const report = await crawler.run(await loadRecipes([output, nativeTable, textBoxes]))
      expect(report.recipes.map(recipe => [recipe.recipeId, recipe.emitted, recipe.rejected])).toEqual([['deck-table', 2, 0], ['deck-grid', 2, 0]])
      expect(sink.records.map(({ data }) => data)).toEqual([
        { slide: 'Incentivi giugno', model: 'Pandina', price: 15_950, discount: 12.5, note: 'Prezzi IVA inclusa.' },
        { slide: 'Incentivi giugno', model: 'Pandina Cross', price: 17_950, discount: 12.5, note: 'Prezzi IVA inclusa.' },
        { slide: 'Griglia prezzi Jeep', model: 'Avenger', price: 24_950, discount: 8, note: null },
        { slide: 'Griglia prezzi Jeep', model: 'Compass', price: 39_900, discount: 10, note: null },
      ])
    } finally {
      await crawler.close()
    }
  })
})
