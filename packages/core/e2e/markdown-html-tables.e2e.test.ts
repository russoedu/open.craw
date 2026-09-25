import type { Server } from 'node:http'
import { createCrawler, loadRecipes, memorySink } from '../src/index'
import { browserConfig, FIXTURE_BASE, startFixtureSite, stopFixtureSite } from './fixture-site'

let site: Server
beforeAll(async () => { site = await startFixtureSite() })
afterAll(async () => { await stopFixtureSite(site) })

const priceOutput = {
  kind:    'output',
  id:      'md-price',
  version: 1,
  fields:  {
    model:   { type: 'string', key: true, required: true },
    price:   { type: 'number', required: true },
    updated: { type: 'date', required: true },
    link:    { type: 'url', nullable: true },
  },
}

const markdown = {
  kind:   'input',
  id:     'markdown-list',
  output: 'md-price',
  mode:   'api',
  start:  [{ url: `${FIXTURE_BASE}/listino.md` }],
  steps:  [
    { type: 'request', url: '{{start.url}}', as: 'markdown' },
    { type: 'extract', id: 'front', selector: 'script[data-front-matter]', kind: 'css', take: 'text' },
    { type: 'extract', id: 'updated', from: 'front', selector: '$.updated', kind: 'jsonpath' },
    { type: 'extract', id: 'link', selector: "section[data-heading='Prezzi' i] table a", kind: 'css', take: 'attr:href' },
    { type: 'extract', id: 'table', selector: '^Modello Versione', kind: 'table', columns: { model: '^Modello$', price: '^Prezzo$' } },
    { type: 'set', id: 'rows', value: '{{table.rows}}' },
    // The short row has no price: skip it.
    { type: 'forEach', over: 'rows', as: 'row', steps: [{ type: 'if', test: "{{ row.price != '' }}", steps: [{ type: 'emit' }] }] },
  ],
  mapping: {
    model:   { from: 'row.model' },
    price:   { from: 'row.price', transform: [{ op: 'number', locale: 'it-IT' }] },
    updated: { from: 'updated' },
    link:    { from: 'link' },
  },
}

const specOutput = {
  kind:    'output',
  id:      'spec',
  version: 1,
  fields:  {
    model:   { type: 'string', key: true, required: true },
    version: { type: 'string', key: true, required: true },
    urban:   { type: 'number', required: true },
  },
}

const specSteps = [
  { type: 'extract', id: 'table', selector: '^Model Version', kind: 'table', headerRows: 2, columns: { model: '^Model$', version: '^Version$', urban: '^Consumption Urban$' } },
  { type: 'set', id: 'rows', value: '{{table.rows}}' },
  { type: 'forEach', over: 'rows', as: 'row', emit: true, steps: [] },
]
const specMapping = { model: { from: 'row.model' }, version: { from: 'row.version' }, urban: { from: 'row.urban', transform: [{ op: 'number', locale: 'it-IT' }] } }
const specsFetched = { kind: 'input', id: 'specs-api', output: 'spec', mode: 'api', start: [{ url: `${FIXTURE_BASE}/specs` }], steps: [{ type: 'request', url: '{{start.url}}' }, ...specSteps], mapping: specMapping }
const specsLive = { kind: 'input', id: 'specs-web', output: 'spec', mode: 'web', start: [{ url: `${FIXTURE_BASE}/specs` }], steps: [{ type: 'goto', url: '{{start.url}}' }, ...specSteps], mapping: specMapping }

describe('markdown and HTML tables', () => {
  it('reads Markdown served as text/plain: front matter, a section, and its table', async () => {
    const sink = memorySink()
    const crawler = createCrawler({ sink })
    try {
      const report = await crawler.run(await loadRecipes([priceOutput, markdown]))
      expect(report.recipes[0]).toMatchObject({ emitted: 2, rejected: 0 })
      expect(sink.records.map(({ data }) => [data.model, data.price, data.updated, data.link])).toEqual([['Pandina', 15_950, '2026-06-01', 'https://example.com/600e'], ['600e', 36_950, '2026-06-01', 'https://example.com/600e']])
    } finally {
      await crawler.close()
    }
  })

  it('reads an HTML table with rowspan and colspan, fetched and live alike', async () => {
    const sink = memorySink()
    const crawler = createCrawler({ sink, dedupe: 'recipe', browser: browserConfig() })
    try {
      const report = await crawler.run(await loadRecipes([specOutput, specsFetched, specsLive]))
      expect(report.recipes.map(recipe => [recipe.recipeId, recipe.emitted, recipe.rejected])).toEqual([['specs-api', 3, 0], ['specs-web', 3, 0]])
      const expected = [['Pandina', '1.0 Hybrid', 5.2], ['Pandina', '1.0 Hybrid Cross', 5.4], ['600e', 'La Prima', 0]]
      expect(sink.records.map(({ data }) => [data.model, data.version, data.urban])).toEqual([...expected, ...expected])
    } finally {
      await crawler.close()
    }
  })
})
