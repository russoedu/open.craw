import type { Server } from 'node:http'
import { createCrawler, loadRecipes, memorySink } from '../src/index'
import { browserConfig, FIXTURE_BASE, startFixtureSite, stopFixtureSite } from './fixture-site'
import { reportRequests } from './report-site'

let site: Server
beforeAll(async () => { site = await startFixtureSite() })
afterAll(async () => { await stopFixtureSite(site) })

const output = { kind: 'output', id: 'maker', version: 1, fields: { maker: { type: 'string', key: true, required: true }, states: { type: 'string' }, total: { type: 'integer' } } }

/** The report's rows, fetched the way its page fetches them: the form's fields, a page size and a cursor. */
const readRows = [
  { type: 'goto', url: '{{start.url}}' },
  {
    type:  'paginate',
    next:  { jsonpath: '$.next', as: 'cursor' },
    steps: [
      { type: 'request', url: '/report/rows', method: 'POST', form: { selector: '#reportForm', omit: ['token'], set: { pageSize: '3', after: "{{ default(cursor, '') }}" } } },
      { type: 'extract', id: 'rows', selector: '$.rows[*]', kind: 'jsonpath', take: 'json', many: true },
      { type: 'forEach', over: 'rows', as: 'row', emit: true, steps: [] },
    ],
  },
]

async function crawl (mode: 'web' | 'api'): Promise<{ records: Record<string, unknown>[], error?: string }> {
  const sink = memorySink()
  const crawler = createCrawler({ browser: browserConfig(), sink })
  const input = { kind: 'input', id: 'report', output: 'maker', mode, start: [{ url: `${FIXTURE_BASE}/report` }], steps: mode === 'web' ? readRows : readRows.slice(1), mapping: { maker: { from: 'row.maker' }, states: { from: 'row.states' }, total: { from: 'row.total' } } }
  try {
    const report = await crawler.run(await loadRecipes([output, input]))

    return {
      records: sink.records.map(({ data }) => {
        const { scrapedAt: _scrapedAt, ...rest } = data

        return rest
      }),
      error: report.recipes[0].error,
    }
  } finally {
    await crawler.close()
  }
}

describe('request in web mode (real chromium)', () => {
  it("posts the page's form through the page's session and pages the JSON with its cursor", async () => {
    reportRequests.length = 0
    const { records, error } = await crawl('web')
    expect(error).toBeUndefined()
    expect(records.map(record => record.maker)).toEqual(['ASHOK LEYLAND', 'BAJAJ AUTO', 'EICHER', 'HERO', 'MAHINDRA', 'TATA MOTORS', 'TVS'])
    expect(records[0]).toEqual({ maker: 'ASHOK LEYLAND', states: 'DL+MH', total: 10 })
    // What the browser would post: both chosen states, no disabled field, no unticked box; token omitted; the cursor advancing.
    expect(reportRequests.map(form => form.toString())).toEqual([
      'state=DL&state=MH&year=2026&pageSize=3&after=',
      'state=DL&state=MH&year=2026&pageSize=3&after=EICHER',
      'state=DL&state=MH&year=2026&pageSize=3&after=TATA+MOTORS',
    ])
  }, 60_000)

  it('refuses a form body in api mode before the run', async () => {
    await expect(crawl('api')).rejects.toThrow('a form body is read from a live page: web mode only')
  }, 60_000)
})
