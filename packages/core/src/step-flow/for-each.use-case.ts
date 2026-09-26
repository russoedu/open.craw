import type { ExtractionScope } from '../extraction-scope'
import type { ForEachStep } from '../recipe-schema'
import { renderText } from '../template'
import type { RunGate } from './run-gate.policy'
import type { EmitOutcome, StepWalk, StepWalkOptions } from './run-steps.use-case'
import { disposeQuietly } from './step-runner.contract'
import type { StepRunner } from './step-runner.contract'

/**
 * Runs a body once per item of a list (`over`), or once per live element
 * matching `selector`, each in a fresh child scope with the item bound under
 * `as`; emits a record per iteration when asked.
 *
 * With a concurrent gate, iterations of a list run as permits allow and
 * records come out in completion order; without one, in list order. In web
 * mode each parallel iteration runs in a tab of its own (`runner.fork`); a
 * loop over live elements stays sequential, since its elements live on one page.
 *
 * @param step - The forEach step.
 * @param scope - The scope the list lives in.
 * @param walk - Runs a step list; also carries the emit callback.
 * @returns `stop` when the crawl reached its record limit.
 */
export async function runForEach (step: ForEachStep, scope: ExtractionScope, walk: StepWalk): Promise<EmitOutcome> {
  const items = await itemsOf(step, scope, walk)
  const gate = walk.gate
  if (gate?.concurrent === true && step.selector === undefined && (walk.recipe.mode === 'api' || walk.runner.fork !== undefined)) return runPooled(step, scope, walk, items, gate)
  for (const item of items) {
    if (await runIteration(step, scope, walk, item) === 'stop') return 'stop'
  }

  return 'continue'
}

async function runIteration (step: ForEachStep, scope: ExtractionScope, walk: StepWalk, item: unknown, overrides?: Partial<StepWalkOptions>): Promise<EmitOutcome> {
  const child = scope.child()
  child.set(step.as, item)
  const outcome = await walk.runSteps(step.steps, child, `${walk.path}.steps`, overrides)
  if (outcome === 'stop' || step.emit === undefined) return outcome

  return walk.onEmit(child, step.emit === true ? undefined : step.emit.output)
}

/**
 * Starts iterations as the gate hands out permits. A `stop` or a failure stops
 * new iterations; the ones in flight finish first, so the runner is never
 * disposed under them. The first failure is rethrown afterwards.
 */
async function runPooled (step: ForEachStep, scope: ExtractionScope, walk: StepWalk, items: unknown[], gate: RunGate): Promise<EmitOutcome> {
  let stopped = false
  let failure: { error: unknown } | undefined
  const tasks: Promise<void>[] = []
  const nested = gate.nested()
  const iterate = async (item: unknown, release: () => void): Promise<void> => {
    let runner: StepRunner | undefined
    try {
      runner = walk.runner.fork === undefined ? walk.runner : await walk.runner.fork()
      if (await runIteration(step, scope, walk, item, { gate: nested, runner }) === 'stop') stopped = true
    } catch (error) {
      failure ??= { error }
    } finally {
      if (runner !== undefined && runner !== walk.runner) await disposeQuietly(runner)
      release()
    }
  }
  for (const item of items) {
    if (stopped || failure !== undefined) break
    const release = await gate.acquire()
    if (stopped || failure !== undefined) {
      release()
      break
    }
    tasks.push(iterate(item, release))
  }
  await Promise.allSettled(tasks)
  if (failure !== undefined) throw failure.error

  return stopped ? 'stop' : 'continue'
}

async function itemsOf (step: ForEachStep, scope: ExtractionScope, walk: StepWalk): Promise<unknown[]> {
  if (step.selector !== undefined) {
    if (walk.runner.elements === undefined) throw new Error('forEach over selector iterates live elements and needs a browser; this recipe runs in api mode')

    return walk.runner.elements(renderText(step.selector, path => scope.lookup(path)), scope)
  }
  const list = scope.get(step.over ?? '')

  return Array.isArray(list) ? list : (list === undefined || list === null ? [] : [list])
}
