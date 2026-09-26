import type { Server } from 'node:http'
import { createCrawler, loadRecipes, memorySink } from '../src/index'
import type { CrawlReport } from '../src/index'
import { FIXTURE_BASE, startFixtureSite, stopFixtureSite } from './fixture-site'

let site: Server
beforeAll(async () => { site = await startFixtureSite() })
afterAll(async () => { await stopFixtureSite(site) })

const ATOM = 'http://www.w3.org/2005/Atom'
// eslint-disable-next-line unicorn/prefer-https -- a namespace is a name, not a link: it must match the feed byte for byte
const MEDIA = 'http://search.yahoo.com/mrss/'

const entryOutput = {
  kind:    'output',
  id:      'entry',
  version: 1,
  fields:  { title: { type: 'string', key: true, required: true }, link: { type: 'url', required: true }, updated: { type: 'datetime', required: true }, thumbnail: { type: 'url', nullable: true } },
}

/** Each entry of the Atom feed: taken as markup, then queried again with the same namespaces. */
const feed = {
  kind:   'input',
  id:     'feed',
  output: 'entry',
  mode:   'api',
  start:  [{ url: `${FIXTURE_BASE}/feed.xml` }],
  steps:  [
    { type: 'request', url: '{{start.url}}' },
    { type: 'extract', id: 'entries', selector: '//a:entry', kind: 'xpath', namespaces: { a: ATOM }, take: 'json', many: true },
    {
      type:  'forEach',
      over:  'entries',
      as:    'entry',
      emit:  true,
      steps: [
        { type: 'extract', id: 'title', from: 'entry', selector: '/a:entry/a:title', kind: 'xpath', namespaces: { a: ATOM } },
        { type: 'extract', id: 'link', from: 'entry', selector: '/entry/link/@href', kind: 'xpath', ignoreNamespaces: true, take: 'value' },
        { type: 'extract', id: 'updated', from: 'entry', selector: 'string(//*[local-name()="updated"])', kind: 'xpath' },
        { type: 'extract', id: 'thumbnail', from: 'entry', selector: '//media:thumbnail/@url', kind: 'xpath', namespaces: { a: ATOM, media: MEDIA }, take: 'value', many: true },
      ],
    },
  ],
  mapping: {
    title:     { from: 'title' },
    link:      { from: 'link', transform: [{ op: 'absoluteUrl' }] },
    updated:   { from: 'updated' },
    thumbnail: { from: 'thumbnail', transform: [{ op: 'first' }, { op: 'absoluteUrl' }] },
  },
}

const productOutput = { kind: 'output', id: 'priced', version: 1, fields: { url: { type: 'url', key: true, required: true }, name: { type: 'string', required: true }, sizes: { type: 'array', items: { type: 'string' } } } }

/** Every page a gzipped sitemap lists, read with XPath on the fetched HTML. */
const sitemap = {
  kind:   'input',
  id:     'sitemap',
  output: 'priced',
  mode:   'api',
  start:  [{ url: `${FIXTURE_BASE}/sitemap.xml.gz` }],
  steps:  [
    { type: 'request', url: '{{start.url}}' },
    { type: 'extract', id: 'pages', selector: '//loc', kind: 'xpath', ignoreNamespaces: true, many: true },
    {
      type:  'forEach',
      over:  'pages',
      as:    'page_url',
      emit:  true,
      steps: [
        { type: 'request', url: '{{page_url}}' },
        { type: 'extract', id: 'name', selector: '//h1', kind: 'xpath' },
        // The page's table has no <tbody>: the HTML parser adds it, as a browser does.
        { type: 'extract', id: 'sizes', selector: "//table[@class='variants']/tbody/tr/td[@class='size']", kind: 'xpath', many: true },
      ],
    },
  ],
  mapping: { url: { from: 'page.url' }, name: { from: 'name' }, sizes: { from: 'sizes' } },
}

async function crawl (recipes: unknown[]): Promise<{ report: CrawlReport, records: Record<string, unknown>[] }> {
  const sink = memorySink()
  const crawler = createCrawler({ sink })
  try {
    const report = await crawler.run(await loadRecipes(recipes))

    return { report, records: sink.records.map(({ data: { scrapedAt: _at, ...rest } }) => rest) }
  } finally {
    await crawler.close()
  }
}

describe('XML', () => {
  it('reads an Atom feed with namespaces, prefixed, ignored or matched by local name', async () => {
    const { report, records } = await crawl([entryOutput, feed])
    expect(report.recipes[0].error).toBeUndefined()
    expect(records).toEqual([
      { title: 'Pandina & Pandina Cross', link: `${FIXTURE_BASE}/product/11`, updated: '2026-06-01T09:00:00.000Z', thumbnail: `${FIXTURE_BASE}/img/11-1.jpg` },
      { title: '600e <La Prima>', link: `${FIXTURE_BASE}/product/12`, updated: '2026-06-02T09:00:00.000Z', thumbnail: null },
    ])
  })

  it('walks a gzipped sitemap and queries each page with XPath', async () => {
    const { report, records } = await crawl([productOutput, sitemap])
    expect(report.recipes[0].error).toBeUndefined()
    expect(records).toEqual([
      { url: `${FIXTURE_BASE}/product/11`, name: 'Product 11', sizes: ['M', 'L'] },
      { url: `${FIXTURE_BASE}/product/12`, name: 'Product 12', sizes: ['M', 'L'] },
      { url: `${FIXTURE_BASE}/product/21`, name: 'Product 21', sizes: ['M', 'L'] },
    ])
  })
})
