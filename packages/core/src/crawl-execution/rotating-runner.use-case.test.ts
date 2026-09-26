import { EventBus } from '../crawl-events'
import type { CrawlEvent } from '../crawl-events'
import { ExtractionScope } from '../extraction-scope'
import type { InputRecipe } from '../recipe-schema'
import { BlockedError } from '../step-flow'
import type { StepRunner } from '../step-flow'
import { RotatingRunner } from './rotating-runner.use-case'
import type { LeasedRunner } from './rotating-runner.use-case'

const recipe = { id: 'r' } as InputRecipe

function harness (maxRotations: number): { opened: number[], released: number[], disposed: number[], events: CrawlEvent[], open: () => Promise<RotatingRunner> } {
  const opened: number[] = []
  const released: number[] = []
  const disposed: number[] = []
  const events: CrawlEvent[] = []
  const open = async (attempt: number): Promise<LeasedRunner> => {
    opened.push(attempt)
    const runner: StepRunner = {
      runLeaf:  async () => { if (attempt === 1) throw new BlockedError('http://x/', 403, 'HTTP 403') },
      nextPage: async () => null,
      dispose:  async () => { disposed.push(attempt) },
    }

    return { runner, lease: { profile: 'p', kind: 'proxy', session: String(attempt), release: async () => { released.push(attempt) } } }
  }

  return { opened, released, disposed, events, open: async () => RotatingRunner.open({ recipe, events: new EventBus((event) => { events.push(event) }), maxRotations, open }) }
}

async function blockedError (runner: RotatingRunner): Promise<BlockedError> {
  try {
    await runner.runLeaf({ type: 'goto', url: 'x' }, new ExtractionScope())
  } catch (error) {
    return error as BlockedError
  }
  throw new Error('expected a block')
}

describe('RotatingRunner', () => {
  it('forks a tab per iteration from the current runner, and again after a rotation', async () => {
    const forked: number[] = []
    const closed: number[] = []
    const open = async (attempt: number): Promise<LeasedRunner> => {
      const leaf = async (): Promise<void> => { if (attempt === 1) throw new BlockedError('http://x/', 403, 'HTTP 403') }
      const runner: StepRunner = {
        runLeaf:  leaf,
        nextPage: async () => null,
        fork:     async () => {
          forked.push(attempt)

          return { runLeaf: leaf, nextPage: async () => null, dispose: async () => { closed.push(attempt) } }
        },
        dispose: async () => undefined,
      }

      return { runner, lease: { profile: 'p', kind: 'proxy', session: String(attempt) } }
    }
    const rotating = await RotatingRunner.open({ recipe, events: new EventBus(), maxRotations: 1, open })
    const tab = await rotating.fork()
    let error: unknown
    try {
      await tab.runLeaf({ type: 'goto', url: 'x' }, new ExtractionScope())
    } catch (error_) {
      error = error_
    }
    expect(error).toBeInstanceOf(BlockedError)
    await expect(tab.rotate?.(error as BlockedError)).resolves.toBe(true)
    await tab.runLeaf({ type: 'goto', url: 'x' }, new ExtractionScope())
    await tab.dispose()
    // one tab on the first runner, closed when the rotation made it stale; one on the second, closed at the end
    expect(forked).toEqual([1, 2])
    expect(closed).toEqual([1, 2])
  })

  it('reports the block and rotates once for blocks raised by the same runner', async () => {
    const test = harness(2)
    const runner = await test.open()
    const first = await blockedError(runner)
    const second = await blockedError(runner)
    await expect(Promise.all([runner.rotate(first), runner.rotate(second)])).resolves.toEqual([true, true])
    expect(test.opened).toEqual([1, 2])
    await expect(runner.runLeaf({ type: 'goto', url: 'x' }, new ExtractionScope())).resolves.toBeUndefined()
    expect(test.events.filter(event => event.type === 'access:blocked')).toHaveLength(2)
    expect(test.events.filter(event => event.type === 'access:rotate').map(event => event.type === 'access:rotate' && event.attempt)).toEqual([2])
    await runner.dispose()
    expect(test.disposed.sort((a, b) => a - b)).toEqual([1, 2])
    expect(test.released.sort((a, b) => a - b)).toEqual([1, 2])
  })

  it('refuses to rotate without a budget or past it', async () => {
    const none = harness(0)
    const runner = await none.open()
    await expect(runner.rotate(await blockedError(runner))).resolves.toBe(false)
    const one = harness(1)
    const limited = await one.open()
    const error = await blockedError(limited)
    await expect(limited.rotate(error)).resolves.toBe(true)
    await expect(limited.rotate(new BlockedError('http://x/', 403, 'HTTP 403'))).resolves.toBe(false)
    expect(one.opened).toEqual([1, 2])
  })
})
