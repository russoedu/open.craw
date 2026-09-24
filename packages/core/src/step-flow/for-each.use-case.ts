import type { ExtractionScope } from '../extraction-scope'
import type { ForEachStep } from '../recipe-schema'
import type { EmitOutcome, StepWalk } from './run-steps.use-case'

/**
 * Runs a body once per item of a list, each in a fresh child scope with the
 * item bound under `as`; emits a record per iteration when asked.
 *
 * @param step - The forEach step.
 * @param scope - The scope the list lives in.
 * @param walk - Runs a step list; also carries the emit callback.
 * @returns `stop` when the crawl reached its record limit.
 */
export async function runForEach (step: ForEachStep, scope: ExtractionScope, walk: StepWalk): Promise<EmitOutcome> {
  const list = scope.get(step.over)
  const items = Array.isArray(list) ? list : (list === undefined || list === null ? [] : [list])
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
