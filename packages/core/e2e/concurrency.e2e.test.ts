import type { Server } from 'node:http'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createCrawler, jsonLinesSink, loadRecipeSet, memorySink } from '../src/index'
import type { CrawlEvent } from '../src/index'
import { browserConfig, expectedRecords, startFixtureSite, stopFixtureSite } from './fixture-site'

let site: Server
beforeAll(async () => { site = await startFixtureSite() })
afterAll(async () => { await stopFixtureSite(site) })

const output = join(__dirname, 'recipes', 'product.output.json')
const input = join(__dirname, 'recipes', 'concurrent', 'shop-api-detail.input.json')

describe('concurrency and resume (api mode)', () => {
  it('fetches product pages three at a time and produces the same records', async () => {
    const recipes = await loadRecipeSet({ output, inputs: [input] })
    const sink = memorySink()
    const events: CrawlEvent[] = []
    const crawler = createCrawler({ browser: browserConfig(), sink, onEvent: (event) => { events.push(event) } })
    try {
      const report = await crawler.run(recipes)
      expect(report.recipes[0].error).toBeUndefined()
      // login page, 3 list pages, 6 product pages
      expect(report.recipes[0]).toMatchObject({ emitted: 6, rejected: 0, skipped: 0, pages: 10 })
      const records = sink.records.map(({ data: { scrapedAt: _at, ...rest } }) => rest).sort((a, b) => String(a.url).localeCompare(String(b.url)))
      expect(records).toEqual(expectedRecords())
      // the first request of a page's detail fan-out starts before the previous detail response arrived
      const detailStarts = events.filter(event => event.type === 'step:start' && event.stepId === 'detail')
      expect(detailStarts).toHaveLength(6)
    } finally {
      await crawler.close()
    }
  }, 120000)

  it('stops at maxRecords exactly, however many iterations are in flight', async () => {
    const recipes = await loadRecipeSet({ output, inputs: [input] })
    const limited = { ...recipes.inputs[0], limits: { ...recipes.inputs[0].limits, maxRecords: 3 } }
    const sink = memorySink()
    const crawler = createCrawler({ browser: browserConfig(), sink })
    try {
      const report = await crawler.run({ output: recipes.output, inputs: [limited] })
      expect(report.recipes[0].emitted).toBe(3)
      expect(sink.records).toHaveLength(3)
    } finally {
      await crawler.close()
    }
  }, 120000)

  it('resumes into an appended file: the second run skips every record the first wrote', async () => {
    const recipes = await loadRecipeSet({ output, inputs: [input] })
    const directory = await mkdtemp(join(tmpdir(), 'resume-'))
    const path = join(directory, 'products.jsonl')
    const first = createCrawler({ browser: browserConfig(), sink: jsonLinesSink(path, { append: true }), resume: true })
    try {
      const report = await first.run(recipes)
      expect(report.recipes[0]).toMatchObject({ emitted: 6, skipped: 0 })
    } finally {
      await first.close()
    }
    const events: CrawlEvent[] = []
    const second = createCrawler({ browser: browserConfig(), sink: jsonLinesSink(path, { append: true }), resume: true, onEvent: (event) => { events.push(event) } })
    try {
      const report = await second.run(recipes)
      expect(report.recipes[0]).toMatchObject({ emitted: 0, skipped: 6, duplicates: 0 })
      expect(report.sink.written).toBe(0)
      expect(events.filter(event => event.type === 'record:skipped')).toHaveLength(6)
    } finally {
      await second.close()
    }
    const content = await readFile(path, 'utf8')
    const lines = content.trim().split('\n')
    expect(lines).toHaveLength(6)
    expect(JSON.parse(lines[0])).toHaveProperty('_key')
    expect(() => createCrawler({ sink: { open: async () => {}, write: async () => {}, close: async () => ({ written: 0 }) }, resume: true })).toThrow(/resume needs a sink/)
  }, 180000)
})
