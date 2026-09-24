import { EventBus } from '../crawl-events'
import type { CrawlEvent } from '../crawl-events'
import { ExtractionScope } from '../extraction-scope'
import { HookRegistry } from '../hooks'
import type { InputRecipe, PaginateNext, Step } from '../recipe-schema'
import { runSteps } from './run-steps.use-case'
import { StepFailure } from './step-failure.error'
import type { NextPageResult, StepRunner } from './step-runner.contract'

const recipe: InputRecipe = { kind: 'input', id: 'r', output: 'o', mode: 'api', start: [{ url: 'http://x/1' }], steps: [], mapping: {} }

interface FakeRunner extends StepRunner {
  leaves: string[]
  pages:  string[]
}

function fakeRunner (documents: Record<string, unknown[]>, nextPages: Record<string, NextPageResult> = {}): FakeRunner {
  const runner: FakeRunner = {
    leaves: [],
    pages:  [],
    async runLeaf (step, scope) {
      runner.leaves.push(step.type)
      if (step.type === 'extract' && step.id !== undefined) {
        const url = scope.pageState?.url ?? ''
        const matches = documents[url] ?? []
        if (!(step.many ?? false) && matches.length === 0) throw new Error(`no match for ${step.selector}`)
        scope.set(step.id, step.many === true ? matches : matches[0])
      }
      if (step.type === 'request' && step.id !== undefined) {
        const url = scope.pageState?.url ?? ''
        runner.pages.push(url)
        scope.setPage({ url, document: { kind: 'json', data: documents[url] } })
        scope.set(step.id, documents[url])
      }
    },
    async nextPage (_next: PaginateNext, scope) {
      // A cursor page never yields another cursor here, so cursor pagination ends after one hop.
      if (scope.has('cursor')) return null

      return nextPages[scope.pageState?.url ?? ''] ?? null
    },
    async dispose () {},
  }

  return runner
}

async function run (steps: Step[], runner: StepRunner, options: { limit?: number, hooks?: HookRegistry, recipe?: InputRecipe } = {}): Promise<{ emitted: Record<string, unknown>[], events: CrawlEvent[], outcome: string }> {
  const emitted: Record<string, unknown>[] = []
  const events: CrawlEvent[] = []
  const scope = new ExtractionScope()
  scope.setPage({ url: 'http://x/1', number: 1 })
  const outcome = await runSteps(steps, scope, {
    recipe: options.recipe ?? recipe,
    runner,
    hooks:  options.hooks ?? new HookRegistry(),
    events: new EventBus((event) => { events.push(event) }),
    onEmit: async (emitScope) => {
      emitted.push(emitScope.snapshot())

      return options.limit !== undefined && emitted.length >= options.limit ? 'stop' : 'continue'
    },
  })

  return { emitted, events, outcome }
}

describe('runSteps', () => {
  it('runs forEach in a fresh child scope per item and emits per iteration', async () => {
    const runner = fakeRunner({ 'http://x/1': ['/a', '/b'] })
    const steps: Step[] = [
      { type: 'extract', id: 'links', selector: 'a', kind: 'css', many: true },
      { type: 'forEach', over: 'links', as: 'link', emit: true, steps: [{ type: 'set', id: 'label', value: 'item {{link}}' }] },
    ]
    const { emitted, outcome } = await run(steps, runner)
    expect(outcome).toBe('continue')
    expect(emitted.map(snapshot => [snapshot.link, snapshot.label])).toEqual([['/a', 'item /a'], ['/b', 'item /b']])
    expect(emitted[0].links).toEqual(['/a', '/b'])
  })

  it('stops the whole walk when the emit callback says so', async () => {
    const runner = fakeRunner({ 'http://x/1': ['/a', '/b', '/c'] })
    const steps: Step[] = [
      { type: 'extract', id: 'links', selector: 'a', kind: 'css', many: true },
      { type: 'forEach', over: 'links', as: 'link', emit: true, steps: [] },
      { type: 'set', id: 'after', value: 'ran' },
    ]
    const { emitted, outcome } = await run(steps, runner, { limit: 2 })
    expect(outcome).toBe('stop')
    expect(emitted).toHaveLength(2)
    expect(runner.leaves).toEqual(['extract'])
  })

  it('paginates with fresh scopes, advancing the page URL and number', async () => {
    const documents = { 'http://x/1': [{ id: 1 }], 'http://x/2': [{ id: 2 }], 'http://x/3': [{ id: 3 }] }
    const runner = fakeRunner(documents, { 'http://x/1': { kind: 'url', url: 'http://x/2' }, 'http://x/2': { kind: 'url', url: 'http://x/3' } })
    const steps: Step[] = [{
      type:  'paginate',
      next:  { url: 'unused' },
      steps: [
        { type: 'request', id: 'list', url: '{{page.url}}' },
        { type: 'forEach', over: 'list', as: 'item', emit: true, steps: [] },
      ],
    }]
    const { emitted, events } = await run(steps, runner)
    expect(runner.pages).toEqual(['http://x/1', 'http://x/2', 'http://x/3'])
    expect(emitted.map(snapshot => (snapshot.item as { id: number }).id)).toEqual([1, 2, 3])
    expect(emitted.map(snapshot => (snapshot.page as { number: number }).number)).toEqual([1, 2, 3])
    expect(events.filter(event => event.type === 'page:visit').map(event => (event as { url: string }).url)).toEqual(['http://x/2', 'http://x/3'])
  })

  it('honours maxPages, until and cursor bindings', async () => {
    const documents = { 'http://x/1': [{ id: 1 }], 'http://x/2': [{ id: 2 }] }
    const cursor = fakeRunner(documents, { 'http://x/1': { kind: 'value', name: 'cursor', value: 'c2' } })
    const bodies: Step[] = [{ type: 'request', id: 'list', url: '{{page.url}}' }, { type: 'set', id: 'seen', value: '{{cursor}}' }, { type: 'emit' }]
    const withCursor = await run([{ type: 'paginate', next: { jsonpath: '$.c', as: 'cursor' }, steps: bodies }], cursor)
    expect(withCursor.emitted.map(snapshot => snapshot.seen)).toEqual([undefined, 'c2'])
    expect(withCursor.emitted).toHaveLength(2)

    const endless = fakeRunner(documents, { 'http://x/1': { kind: 'url', url: 'http://x/1' } })
    const capped = await run([{ type: 'paginate', next: { url: 'x' }, maxPages: 3, steps: [{ type: 'emit' }] }], endless)
    expect(capped.emitted).toHaveLength(3)
    const until = await run([{ type: 'paginate', next: { url: 'x' }, until: '{{page.number}}', steps: [{ type: 'emit' }] }], endless)
    expect(until.emitted).toHaveLength(1)
  })

  it('applies skip, retry and fail policies', async () => {
    const runner = fakeRunner({})
    const skipped = await run([{ type: 'extract', id: 'x', selector: 'h1', kind: 'css', onError: { policy: 'skip' } }, { type: 'emit' }], runner)
    expect(skipped.emitted[0].x).toBeUndefined()
    expect(skipped.events.some(event => event.type === 'step:skip')).toBe(true)

    let retried: unknown
    try {
      await run([{ type: 'extract', id: 'x', selector: 'h1', kind: 'css', onError: { policy: 'retry', attempts: 3 } }], runner)
    } catch (error) {
      retried = error
    }
    expect(retried).toBeInstanceOf(StepFailure)
    expect((retried as StepFailure).message).toContain('steps.0 (extract) failed: no match for h1')

    const recipeSkips: InputRecipe = { ...recipe, onError: { policy: 'skip' } }
    const inherited = await run([{ type: 'extract', id: 'x', selector: 'h1', kind: 'css' }], runner, { recipe: recipeSkips })
    expect(inherited.outcome).toBe('continue')
    await expect(run([{ type: 'extract', id: 'x', selector: 'h1', kind: 'css' }], runner)).rejects.toThrow(StepFailure)
  })

  it('runs hooks and when conditions', async () => {
    const hooks = new HookRegistry({ double: (_input: unknown, args: Record<string, unknown>) => Number(args.n) * 2 })
    const runner = fakeRunner({})
    const steps: Step[] = [
      { type: 'set', id: 'n', value: 21 },
      { type: 'hook', id: 'doubled', name: 'double', args: { n: '{{n}}' } },
      { type: 'set', id: 'skipped', value: 'no', when: '{{missing}}' },
      { type: 'set', id: 'kept', value: 'yes', when: '{{n}}' },
      { type: 'emit' },
    ]
    const { emitted } = await run(steps, runner, { hooks })
    expect(emitted[0]).toMatchObject({ n: 21, doubled: 42, kept: 'yes' })
    expect(emitted[0].skipped).toBeUndefined()
  })
})
