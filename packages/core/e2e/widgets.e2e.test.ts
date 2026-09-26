import { existsSync, mkdtempSync } from 'node:fs'
import type { Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createCrawler, loadRecipes, memorySink } from '../src/index'
import { browserConfig, FIXTURE_BASE, startFixtureSite, stopFixtureSite } from './fixture-site'

let site: Server
beforeAll(async () => { site = await startFixtureSite() })
afterAll(async () => { await stopFixtureSite(site) })

const output = { kind: 'output', id: 'row', version: 1, fields: { name: { type: 'string', key: true, required: true }, total: { type: 'string' } } }

async function crawl (steps: unknown[], mapping: Record<string, unknown>, vars: Record<string, string> = {}): Promise<{ records: Record<string, unknown>[], error?: string }> {
  const sink = memorySink()
  const crawler = createCrawler({ browser: browserConfig(), sink })
  const input = { kind: 'input', id: 'widgets', output: 'row', mode: 'web', vars, start: [{ url: `${FIXTURE_BASE}/widgets` }], steps: [{ type: 'goto', url: '{{start.url}}' }, ...steps], mapping }
  try {
    const report = await crawler.run(await loadRecipes([output, input]))

    return { records: sink.records.map(({ data }) => ({ name: data.name, total: data.total })), error: report.recipes[0].error }
  } finally {
    await crawler.close()
  }
}

describe('select and download (real chromium)', () => {
  it('drives hidden multi-selects the page listens to, waits for a list the page loads, and adds to a visible one', async () => {
    const { records, error } = await crawl([
      { type: 'select', selector: '#state', values: ['delhi'], force: true, ignoreCase: true },
      // The RTO list only exists once the page reacted to the state: the step waits for it.
      { type: 'select', selector: '#rto', values: ['{{ split(vars.rtos) }}'], force: true },
      { type: 'select', selector: '#fuel', values: ['Petrol', 'CNG'] },
      { type: 'select', selector: '#fuel', values: ['DIESEL'], multiple: true },
      // A blank filter var renders to no values: the control is left as it is.
      { type: 'select', selector: '#fuel', values: ['{{ split(vars.none) }}'], force: true },
      { type: 'extract', id: 'name', selector: '#picked', kind: 'css' },
      { type: 'emit' },
    ], { name: { from: 'name' } }, { rtos: 'DL1, DL3 - OFFICE 3', none: '' })
    expect(error).toBeUndefined()
    expect(records).toEqual([{ name: 'state=DL;rto=DL1,DL3;fuel=PETROL,DIESEL,CNG', total: null }])
  }, 60_000)

  it('names what matched no option once its time is up', async () => {
    const { error } = await crawl([
      { type: 'set', id: 'name', value: 'x' },
      { type: 'select', selector: '#state', values: ['Atlantis'], force: true, timeoutMs: 800 },
    ], { name: { from: 'name' } })
    expect(error).toMatch(/no option "Atlantis" after 800 ms \(options: Delhi, Karnataka, Maharashtra\)/)
  }, 60_000)

  it('reads a downloaded CSV as a document, and keeps a downloaded workbook where asked', async () => {
    const folder = mkdtempSync(join(tmpdir(), 'opencraw-download-'))
    const { records, error } = await crawl([
      { type: 'click', selector: '#xlsx', id: 'book', download: { saveTo: join(folder, '{{ vars.file }}') } },
      { type: 'click', selector: '#csv', id: 'export', download: {} },
      // In web mode a table extract reads the page's HTML tables; `from` reads the downloaded file.
      { type: 'extract', id: 'table', from: 'export', kind: 'table', selector: '^maker', columns: { name: '^maker$', total: '^total$' } },
      { type: 'set', id: 'rows', value: '{{table.rows}}' },
      { type: 'forEach', over: 'rows', as: 'row', emit: true, steps: [] },
    ], { name: { from: 'row.name' }, total: { from: 'row.total' } }, { file: 'kept.xlsx' })
    expect(error).toBeUndefined()
    expect(records).toEqual([{ name: 'TATA MOTORS', total: '130' }, { name: 'HERO', total: '39' }])
    expect(existsSync(join(folder, 'kept.xlsx'))).toBe(true)
  }, 60_000)
})
