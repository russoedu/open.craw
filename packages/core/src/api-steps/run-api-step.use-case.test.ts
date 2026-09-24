import { EventBus } from '../crawl-events'
import { ExtractionScope } from '../extraction-scope'
import { HookRegistry } from '../hooks'
import type { HttpRequest, HttpResponse, HttpSender } from '../http-session'
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
})
