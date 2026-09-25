import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { EventBus } from '../crawl-events'
import { ExtractionScope } from '../extraction-scope'
import { HookRegistry } from '../hooks'
import { HttpError } from '../http-session'
import type { HttpRequest, HttpResponse, HttpSender } from '../http-session'
import { readPdf } from '../pdf-document'
import { csvWorkbook } from '../workbook-document'
import type { InputRecipe } from '../recipe-schema'
import { runSteps } from '../step-flow'
import { ApiStepRunner } from './run-api-step.use-case'

const recipe: InputRecipe = {
  kind:   'input',
  id:     'shop-api',
  output: 'product',
  mode:   'api',
  start:  [{ url: 'http://shop/api/products?page=1' }],
  steps:  [{
    type:  'paginate',
    next:  { jsonpath: '$.nextPage' },
    steps: [
      { type: 'request', id: 'list', url: '{{page.url}}', as: 'json', headers: { 'x-page': '{{page.number}}' } },
      { type: 'extract', id: 'items', from: 'list', selector: '$.items[*]', kind: 'jsonpath', take: 'json', many: true },
      { type: 'forEach', over: 'items', as: 'item', emit: true, steps: [] },
    ],
  }],
  mapping: {},
}

const pages: Record<string, unknown> = {
  'http://shop/api/products?page=1': { items: [{ id: 1 }, { id: 2 }], nextPage: '/api/products?page=2' },
  'http://shop/api/products?page=2': { items: [{ id: 3 }], nextPage: null },
  'http://shop/p/1':                 '<html lang="en"><body><h1> One </h1><a href="/x">x</a><a href="/y">y</a></body></html>',
}

function fakeSender (): HttpSender & { sent: HttpRequest[] } {
  const sent: HttpRequest[] = []

  return {
    sent,
    async send (request): Promise<HttpResponse> {
      sent.push(request)
      const body = pages[request.url]
      if (body === undefined) throw new Error(`HTTP 404 for ${request.url}`)

      return { status: 200, url: request.url, headers: {}, body: typeof body === 'string' ? { kind: 'html', html: body } : { kind: 'json', data: body } }
    },
  }
}

async function crawl (input: InputRecipe, sender: HttpSender): Promise<Record<string, unknown>[]> {
  const emitted: Record<string, unknown>[] = []
  const scope = new ExtractionScope()
  scope.set('start', { url: input.start[0].url })
  scope.setPage({ url: input.start[0].url, number: 1 })
  await runSteps(input.steps, scope, {
    recipe: input,
    runner: new ApiStepRunner(sender, input, new EventBus()),
    hooks:  new HookRegistry(),
    events: new EventBus(),
    onEmit: async (emitScope) => {
      emitted.push(emitScope.snapshot())

      return 'continue'
    },
  })

  return emitted
}

describe('ApiStepRunner', () => {
  it('pages through a JSON API following nextPage URLs, with rendered headers', async () => {
    const sender = fakeSender()
    const emitted = await crawl(recipe, sender)
    expect(emitted.map(snapshot => (snapshot.item as { id: number }).id)).toEqual([1, 2, 3])
    expect(sender.sent.map(request => request.url)).toEqual(['http://shop/api/products?page=1', 'http://shop/api/products?page=2'])
    expect(sender.sent.map(request => request.headers?.['x-page'])).toEqual(['1', '2'])
    expect(emitted[2].page).toEqual({ url: 'http://shop/api/products?page=2', number: 2 })
  })

  it('extracts with css from fetched HTML, single and many, and fails on no match', async () => {
    const html: InputRecipe = {
      ...recipe,
      start: [{ url: 'http://shop/p/1' }],
      steps: [
        { type: 'request', url: '{{start.url}}' },
        { type: 'extract', id: 'title', selector: 'h1', kind: 'css' },
        { type: 'extract', id: 'links', selector: 'a', kind: 'css', take: 'attr:href', many: true },
        { type: 'extract', id: 'none', selector: '.nothing', kind: 'css', many: true },
        { type: 'extract', id: 'missing', selector: '.nothing', kind: 'css', onError: { policy: 'skip' } },
        { type: 'emit' },
      ],
    }
    const [snapshot] = await crawl(html, fakeSender())
    expect(snapshot).toMatchObject({ title: 'One', links: ['/x', '/y'], none: [] })
    expect(snapshot.missing).toBeUndefined()
  })

  it('extracts with regex from the document, a bound text or a list, and renders selector templates', async () => {
    const withRegex: InputRecipe = {
      ...recipe,
      start: [{ url: 'http://shop/p/1' }],
      steps: [
        { type: 'request', url: '{{start.url}}' },
        { type: 'extract', id: 'hrefs', selector: 'href="([^"]+)"', kind: 'regex', many: true },
        { type: 'extract', id: 'first', selector: 'href="([^"]+)"', kind: 'regex' },
        { type: 'set', id: 'inline', value: 'var cfg = {"carPath":"https://cms/x.json"};' },
        { type: 'extract', id: 'carPath', from: 'inline', selector: '"carPath":"([^"]+)"', kind: 'regex' },
        { type: 'set', id: 'texts', value: ['trim: Air', 'trim: GT-Line'] },
        { type: 'extract', id: 'trims', from: 'texts', selector: String.raw`trim: (\S+)`, kind: 'regex', many: true },
        { type: 'set', id: 'wanted', value: 'GT-Line' },
        { type: 'extract', id: 'chosen', from: 'texts', selector: 'trim: ({{wanted}})', kind: 'regex' },
        { type: 'set', id: 'data', value: [{ trimname: 'Air', colours: ['White'] }, { trimname: 'GT-Line', colours: ['Grey', 'Green'] }] },
        { type: 'extract', id: 'colours', from: 'data', selector: "$[?(@.trimname=='{{wanted}}')].colours[*]", kind: 'jsonpath', take: 'json', many: true },
        { type: 'emit' },
      ],
    }
    const [snapshot] = await crawl(withRegex, fakeSender())
    expect(snapshot).toMatchObject({ hrefs: ['/x', '/y'], first: '/x', carPath: 'https://cms/x.json', trims: ['Air', 'GT-Line'], chosen: 'GT-Line', colours: ['Grey', 'Green'] })
  })

  it('resolves a relative request URL against the current page', async () => {
    const sender = fakeSender()
    const relative: InputRecipe = {
      ...recipe,
      start: [{ url: 'http://shop/api/products?page=1' }],
      steps: [
        { type: 'request', id: 'first', url: '{{start.url}}', as: 'json' },
        { type: 'request', id: 'second', url: '/api/products?page=2', as: 'json' },
        { type: 'emit' },
      ],
    }
    await crawl(relative, sender)
    expect(sender.sent.map(request => request.url)).toEqual(['http://shop/api/products?page=1', 'http://shop/api/products?page=2'])
  })

  it('parses JSON-LD text for jsonpath extracts, one block or many', async () => {
    const ld = '{"@type":"Movie","name":"Heat","actors":[{"name":"Al Pacino"},{"name":"Robert De Niro"}]}'
    const recipeWithText: InputRecipe = {
      ...recipe,
      start: [{ url: 'http://shop/p/1' }],
      steps: [
        { type: 'set', id: 'one', value: ld },
        { type: 'set', id: 'many', value: ['not json', '{"@type":"BreadcrumbList"}', `\n/* <![CDATA[ */\n${ld}\n/* ]]> */\n`] },
        { type: 'set', id: 'guarded', value: `<!-- ${ld} -->` },
        { type: 'set', id: 'junk', value: ['nope', 'still nope'] },
        { type: 'extract', id: 'name', from: 'one', selector: '$.name', kind: 'jsonpath', take: 'json' },
        { type: 'extract', id: 'actors', from: 'many', selector: '$[*].actors[*].name', kind: 'jsonpath', take: 'json', many: true },
        { type: 'extract', id: 'types', from: 'many', selector: '$[*].@type', kind: 'jsonpath', take: 'json', many: true },
        { type: 'extract', id: 'nothing', from: 'junk', selector: '$[*].name', kind: 'jsonpath', many: true, onError: { policy: 'skip' } },
        { type: 'extract', id: 'guardedName', from: 'guarded', selector: '$.name', kind: 'jsonpath', take: 'json' },
        { type: 'extract', id: 'movieName', from: 'many', selector: "$[?(@['@type']=='Movie')].name", kind: 'jsonpath', take: 'json' },
        { type: 'emit' },
      ],
    }
    const [snapshot] = await crawl(recipeWithText, fakeSender())
    expect(snapshot).toMatchObject({ name: 'Heat', actors: ['Al Pacino', 'Robert De Niro'], types: ['BreadcrumbList', 'Movie'], guardedName: 'Heat', movieName: 'Heat' })
    expect(snapshot.nothing).toBeUndefined()
  })

  it('binds a cursor with next.jsonpath as, and refuses browser-only steps', async () => {
    const sender = fakeSender()
    const runner = new ApiStepRunner(sender, recipe, new EventBus())
    const scope = new ExtractionScope()
    scope.setPage({ url: 'http://shop/api/products?page=1', number: 1, document: { kind: 'json', data: { cursor: 'abc' } } })
    expect(await runner.nextPage({ jsonpath: '$.cursor', as: 'cursor' }, scope)).toEqual({ kind: 'value', name: 'cursor', value: 'abc' })
    expect(await runner.nextPage({ jsonpath: '$.missing' }, scope)).toBeNull()
    expect(await runner.nextPage({ url: '/api/products?page={{page.number}}' }, scope)).toEqual({ kind: 'url', url: 'http://shop/api/products?page=1' })
    await expect(runner.nextPage({ selector: 'a.next' }, scope)).rejects.toThrow(/needs a browser/)
    await expect(runner.runLeaf({ type: 'goto', url: 'x' }, scope)).rejects.toThrow(/needs a browser/)
  })

  it('turns a blocked response into a BlockedError, and leaves other errors alone', async () => {
    const waf: HttpSender = { send: async request => ({ status: 202, url: request.url, headers: { 'x-amzn-waf-action': 'challenge' }, body: { kind: 'html', html: '' } }) }
    const forbidden: HttpSender = { send: async (request) => { throw new HttpError(403, request.url, { kind: 'text', text: 'no' }, {}) } }
    const missing: HttpSender = { send: async (request) => { throw new HttpError(404, request.url, { kind: 'text', text: 'gone' }, {}) } }
    const custom: HttpSender = { send: async request => ({ status: 200, url: request.url, headers: {}, body: { kind: 'html', html: '<p>Please verify you are human</p>' } }) }
    const one: InputRecipe = { ...recipe, steps: [{ type: 'request', id: 'list', url: '{{page.url}}' }] }
    await expect(crawl(one, waf)).rejects.toThrow('blocked at http://shop/api/products?page=1: x-amzn-waf-action: challenge')
    await expect(crawl(one, forbidden)).rejects.toThrow('blocked at http://shop/api/products?page=1: HTTP 403')
    await expect(crawl(one, missing)).rejects.toThrow('HTTP 404 for http://shop/api/products?page=1')
    await expect(crawl({ ...one, session: { blockedWhen: { text: 'verify you are human' } } }, custom)).rejects.toThrow('body matches')
  })

  it('renders templates in every string of an object body, keeping a lone placeholder\'s type', async () => {
    const sender = fakeSender()
    const withBody: InputRecipe = {
      ...recipe,
      steps: [
        { type: 'set', id: 'clientId', value: 'abc' },
        { type: 'set', id: 'secret', value: 's3cr3t' },
        { type: 'set', id: 'limit', value: '{{5 + 5}}' },
        { type: 'request', id: 'first', url: '{{start.url}}', method: 'POST', as: 'json', body: { client_id: '{{clientId}}', grant: 'client_credentials', note: 'id={{clientId}}', limit: '{{limit}}', raw: 5, flag: true, none: null, nested: { x: '{{clientId}}-x', list: ['{{secret}}', 1] } } },
        { type: 'emit' },
      ],
    }
    await crawl(withBody, sender)
    expect(sender.sent[0].body).toEqual({ client_id: 'abc', grant: 'client_credentials', note: 'id=abc', limit: 10, raw: 5, flag: true, none: null, nested: { x: 'abc-x', list: ['s3cr3t', 1] } })
  })

  it('collects ids across every page, then fans out once pagination has finished', async () => {
    const sender = fakeSender()
    const twoPhase: InputRecipe = {
      ...recipe,
      steps: [
        { type: 'set', id: 'allIds', value: [] },
        {
          type:  'paginate',
          next:  { jsonpath: '$.nextPage' },
          steps: [
            { type: 'request', id: 'list', url: '{{page.url}}', as: 'json' },
            { type: 'extract', id: 'ids', from: 'list', selector: '$.items[*].id', kind: 'jsonpath', take: 'json', many: true },
            { type: 'collect', into: 'allIds', value: '{{ids}}' },
          ],
        },
        { type: 'set', id: 'total', value: '{{len(allIds)}}' },
        { type: 'forEach', over: 'allIds', as: 'id', emit: true, steps: [] },
      ],
    }
    const emitted = await crawl(twoPhase, sender)
    expect(emitted.map(snapshot => snapshot.id)).toEqual([1, 2, 3])
    expect(emitted.map(snapshot => snapshot.total)).toEqual([3, 3, 3])
    // Both list pages were fetched before the first record was emitted.
    expect(sender.sent.map(request => request.url)).toEqual(['http://shop/api/products?page=1', 'http://shop/api/products?page=2'])
  })

  it('refuses to collect into an id nothing bound', async () => {
    const unbound: InputRecipe = { ...recipe, steps: [{ type: 'collect', into: 'nowhere', value: 'x' }] }
    await expect(crawl(unbound, fakeSender())).rejects.toThrow('"nowhere" is not bound: set it to [] before collecting into it')
  })

  it('reads a PDF: tables by header, regex over its rows, jsonpath over its structure', async () => {
    const bytes = readFileSync(join(__dirname, '..', 'pdf-document', 'fixtures', 'discounts.pdf'))
    const pdf = await readPdf(new Uint8Array(bytes))
    const sender: HttpSender = { send: async request => ({ status: 200, url: request.url, headers: {}, body: pdf }) }
    const reading: InputRecipe = {
      ...recipe,
      start: [{ url: 'http://shop/discounts.pdf' }],
      steps: [
        { type: 'request', id: 'doc', url: '{{start.url}}', as: 'pdf' },
        { type: 'extract', id: 'month', selector: String.raw`DISCOUNTS - (\w+ \d{4})`, kind: 'regex' },
        { type: 'extract', id: 'first', from: 'doc', selector: '$.pages[1].rows[0].text', kind: 'jsonpath' },
        { type: 'extract', id: 'tables', selector: '^models', kind: 'table', many: true, until: String.raw`^(note|\*)`, columns: { model: '^models', discount: String.raw`^(discount|\(promo)`, extra: '^extra' } },
        { type: 'forEach', over: 'tables', as: 'table', steps: [{ type: 'set', id: 'rows', value: '{{table.rows}}' }, { type: 'forEach', over: 'rows', as: 'row', emit: true, steps: [] }] },
      ],
    }
    const emitted = await crawl(reading, sender)
    expect(emitted).toHaveLength(12)
    expect(emitted[0]).toMatchObject({ month: 'SEPTEMBER 2026', first: 'MODELS GAMMA\tDiscount %*\tExtras*', table: { title: 'MODELS ALPHA' }, row: { model: 'CITY (model 101)', discount: '19,0%', extra: '+3% registration bonus' } })
    expect(emitted.at(-1)).toMatchObject({ table: { page: 2 }, row: { model: 'G3 BEV', discount: '5,0%' } })
  })

  it('reads a CSV as a workbook: tables with filled groups, regex over its rows, jsonpath over its cells', async () => {
    const text = new TextDecoder('windows-1252').decode(readFileSync(join(__dirname, '..', 'workbook-document', 'fixtures', 'listino.csv')))
    const workbook = csvWorkbook(text, { name: 'listino', encoding: 'windows-1252' })
    const sender: HttpSender = { send: async request => ({ status: 200, url: request.url, headers: {}, body: workbook }) }
    const reading: InputRecipe = {
      ...recipe,
      start: [{ url: 'http://shop/listino.csv' }],
      steps: [
        { type: 'request', id: 'doc', url: '{{start.url}}', as: 'csv' },
        { type: 'extract', id: 'month', selector: String.raw`autoveicoli – (\w+ \d{4})`, kind: 'regex' },
        { type: 'extract', id: 'title', from: 'doc', selector: '$.sheets[0].rows[0][0]', kind: 'jsonpath' },
        { type: 'extract', id: 'table', selector: '^marca modello', kind: 'table', until: '^totale', fillDown: ['brand', 'model'], columns: { brand: '^marca', model: '^modello', version: '^versione', price: '^prezzo' } },
        { type: 'set', id: 'rows', value: '{{table.rows}}' },
        { type: 'forEach', over: 'rows', as: 'row', emit: true, steps: [] },
      ],
    }
    const emitted = await crawl(reading, sender)
    expect(emitted.map(record => record.row)).toEqual([
      { brand: 'Fiat', model: 'Pandina', version: '1.0 Hybrid "Cross"', price: '15.950,00' },
      { brand: 'Fiat', model: 'Pandina', version: '1.0 Hybrid Icon', price: '16.450,00' },
      { brand: 'Citroën', model: 'C3', version: 'Plus; automatica\nnuova', price: '19.300,00' },
      { brand: 'Peugeot', model: '208', version: 'Allure', price: '21.450,00' },
    ])
    expect(emitted[0]).toMatchObject({ month: 'settembre 2026', title: 'Listino prezzi autoveicoli – settembre 2026', table: { sheet: 'listino', title: 'Marca' } })
  })

  it('refuses a table extract on a document that is not a PDF or a workbook, and workbook options on a PDF', async () => {
    const wrong: InputRecipe = { ...recipe, steps: [{ type: 'request', id: 'list', url: '{{start.url}}', as: 'json' }, { type: 'extract', id: 't', selector: 'x', kind: 'table' }] }
    await expect(crawl(wrong, fakeSender())).rejects.toThrow(/table reads a PDF, a workbook \(a spreadsheet, a CSV\), a deck \(a presentation\) or HTML tables; the current document is json/)
    const bytes = readFileSync(join(__dirname, '..', 'pdf-document', 'fixtures', 'discounts.pdf'))
    const pdf = await readPdf(new Uint8Array(bytes))
    const sender: HttpSender = { send: async request => ({ status: 200, url: request.url, headers: {}, body: pdf }) }
    const sheetOnPdf: InputRecipe = { ...recipe, steps: [{ type: 'request', url: '{{start.url}}', as: 'pdf' }, { type: 'extract', id: 't', selector: '^models', kind: 'table', headerRows: 2 }] }
    await expect(crawl(sheetOnPdf, sender)).rejects.toThrow(/"headerRows" reads workbooks/)
  })
})
