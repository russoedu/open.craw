import type { ExtractionScope } from '../extraction-scope'
import type { ForEachStep } from '../recipe-schema'
import { renderText } from '../template'
import type { EmitOutcome, StepWalk } from './run-steps.use-case'

/**
 * Runs a body once per item of a list (`over`), or once per live element
 * matching `selector`, each in a fresh child scope with the item bound under
 * `as`; emits a record per iteration when asked.
 *
 * @param step - The forEach step.
 * @param scope - The scope the list lives in.
 * @param walk - Runs a step list; also carries the emit callback.
 * @returns `stop` when the crawl reached its record limit.
 */
export async function runForEach (step: ForEachStep, scope: ExtractionScope, walk: StepWalk): Promise<EmitOutcome> {
  const items = await itemsOf(step, scope, walk)
  for (const item of items) {
    const child = scope.child()
    child.set(step.as, item)
    const outcome = await walk.runSteps(step.steps, child, `${walk.path}.steps`)
    if (outcome === 'stop') return 'stop'
    if (step.emit !== undefined) {
      const emitted = await walk.onEmit(child, step.emit === true ? undefined : step.emit.output)
      if (emitted === 'stop') return 'stop'
    }
  }

  return 'continue'
}

async function itemsOf (step: ForEachStep, scope: ExtractionScope, walk: StepWalk): Promise<unknown[]> {
  if (step.selector !== undefined) {
    if (walk.runner.elements === undefined) throw new Error('forEach over selector iterates live elements and needs a browser; this recipe runs in api mode')

    return walk.runner.elements(renderText(step.selector, path => scope.lookup(path)), scope)
  }
  const list = scope.get(step.over ?? '')

  return Array.isArray(list) ? list : (list === undefined || list === null ? [] : [list])
}
