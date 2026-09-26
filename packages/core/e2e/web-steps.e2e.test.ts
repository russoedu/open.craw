import type { Server } from 'node:http'
import { createCrawler, loadRecipes, memorySink } from '../src/index'
import type { CrawlEvent } from '../src/index'
import { browserConfig, FIXTURE_BASE, startFixtureSite, stopFixtureSite } from './fixture-site'

let site: Server
beforeAll(async () => { site = await startFixtureSite() })
afterAll(async () => { await stopFixtureSite(site) })

const output = { kind: 'output', id: 'model', version: 1, fields: { name: { type: 'string', key: true, required: true } } }

function recipe (steps: unknown[], extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { kind: 'input', id: 'steps', output: 'model', mode: 'web', start: [{ url: `${FIXTURE_BASE}/captcha/start` }], steps: [{ type: 'goto', url: '{{start.url}}' }, ...steps], mapping: { name: { from: 'name' } }, ...extra }
}

async function crawl (input: Record<string, unknown>): Promise<{ names: unknown[], error?: string, durationMs: number, events: CrawlEvent[] }> {
  const sink = memorySink()
  const events: CrawlEvent[] = []
  const crawler = createCrawler({ browser: browserConfig(), sink, onEvent: (event) => { events.push(event) } })
  try {
    const report = await crawler.run(await loadRecipes([output, input]))

    return { names: sink.records.map(({ data }) => data.name), error: report.recipes[0].error, durationMs: report.recipes[0].durationMs, events }
  } finally {
    await crawler.close()
  }
}

/** A page that serves its shell without the content `fail` times, then the real page. */
function shell (key: string, fail: number): string {
  return `${FIXTURE_BASE}/flaky?key=${key}&fail=${fail}&mode=shell`
}

describe('web steps (real chromium)', () => {
  it('renders an evaluate script and calls it with its rendered args, a lone placeholder keeping its type', async () => {
    const { names, error } = await crawl(recipe([
      {
        type:   'evaluate',
        id:     'picked',
        script: "(a) => a.names.map(name => name.toUpperCase() + '{{ vars.suffix }}' + a.count)",
        args:   { names: '{{ split(vars.names) }}', count: '{{ len(split(vars.names)) }}' },
      },
      { type: 'forEach', over: 'picked', as: 'name', emit: true, steps: [] },
    ], { vars: { names: 'pandina, panda', suffix: '-' } }))
    expect(error).toBeUndefined()
    expect(names).toEqual(['PANDINA-2', 'PANDA-2'])
  }, 60000)

  it('keeps an evaluate script without args working as an expression', async () => {
    const { names, error } = await crawl(recipe([
      { type: 'evaluate', id: 'title', script: 'document.title' },
      { type: 'emit' },
    ], { mapping: { name: { from: 'title' } } }))
    expect(error).toBeUndefined()
    expect(names).toEqual(['Search'])
  }, 60000)

  it('gives up on a wait after its own timeoutMs, and after limits.timeoutMs when it sets none', async () => {
    const own = await crawl(recipe([{ type: 'set', id: 'name', value: 'x' }, { type: 'wait', selector: '#never', timeoutMs: 1500 }]))
    expect(own.error).toMatch(/1500ms/)
    expect(own.durationMs).toBeLessThan(15000)
    const limit = await crawl(recipe([{ type: 'set', id: 'name', value: 'x' }, { type: 'wait', selector: '#never' }], { limits: { timeoutMs: 2000 } }))
    expect(limit.error).toMatch(/2000ms/)
  }, 60000)

  it('loads a page again until its ready element shows, and fails once the reloads are spent', async () => {
    const got = await crawl(recipe([
      { type: 'goto', url: shell('ready-1', 2), ready: { selector: '#ok', timeoutMs: 1000 } },
      { type: 'extract', id: 'name', selector: '#ok', kind: 'css' },
      { type: 'emit' },
    ]))
    expect(got.error).toBeUndefined()
    expect(got.names).toEqual(['ok after 3'])
    expect(got.events.filter(event => event.type === 'request:retry').map(event => (event.type === 'request:retry' ? event.reason : ''))).toEqual(['"#ok" did not show', '"#ok" did not show'])
    const spent = await crawl(recipe([
      { type: 'set', id: 'name', value: 'x' },
      { type: 'goto', url: shell('ready-2', 5), ready: { selector: '#ok', timeoutMs: 500, reloads: 1 } },
    ]))
    expect(spent.error).toMatch(/never showed "#ok" \(2 loads, 500 ms each\)/)
  }, 60000)
})
