import type { ExtractionScope } from '../extraction-scope'
import type { PaginateStep } from '../recipe-schema'
import { isTruthy, render } from '../template'
import type { EmitOutcome, StepWalk } from './run-steps.use-case'

/**
 * Runs a body once per page, each in a fresh child scope, then asks the runner
 * for the next page until there is none, `until` renders truthy, or `maxPages`
 * is reached.
 *
 * The runner reports the visit of each new page; this only steers.
 *
 * @param step - The paginate step.
 * @param scope - The scope to page in; its page URL advances with each page.
 * @param walk - Runs a step list; carries the runner and the emit callback.
 * @returns `stop` when the crawl reached its record limit.
 */
export async function runPaginate (step: PaginateStep, scope: ExtractionScope, walk: StepWalk): Promise<EmitOutcome> {
  let number = scope.pageState?.number ?? 1
  let bound: { name: string, value: unknown } | undefined
  for (let count = 1; ; count += 1) {
    const page = scope.child()
    page.setPage({ number })
    if (bound !== undefined) page.set(bound.name, bound.value)
    const outcome = await walk.runSteps(step.steps, page, `${walk.path}.steps`)
    if (outcome === 'stop') return 'stop'
    if (step.until !== undefined && isTruthy(render(step.until, path => page.lookup(path)))) break
    if (step.maxPages !== undefined && count >= step.maxPages) break
    const next = await walk.runner.nextPage(step.next, page)
    if (next === null) break
    number += 1
    if (next.kind === 'url') {
      scope.setPage({ url: next.url, number })
      bound = undefined
    } else {
      scope.setPage({ number })
      bound = { name: next.name, value: next.value }
    }
  }

  return 'continue'
}
