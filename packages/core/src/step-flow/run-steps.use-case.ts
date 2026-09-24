import type { EventBus } from '../crawl-events'
import type { ExtractionScope } from '../extraction-scope'
import type { HookRegistry } from '../hooks'
import type { InputRecipe, Step } from '../recipe-schema'
import { isTruthy, render } from '../template'
import { runForEach } from './for-each.use-case'
import { runPaginate } from './paginate.use-case'
import { backoffFor, resolveErrorPolicy, sleep } from './retry.policy'
import { StepFailure } from './step-failure.error'
import type { StepRunner } from './step-runner.contract'

/** Whether the walk goes on after a record was emitted. */
export type EmitOutcome = 'continue' | 'stop'

/** Everything a step walk needs. */
export interface StepWalkOptions {
  recipe: InputRecipe
  runner: StepRunner
  hooks:  HookRegistry
  events: EventBus
  /** Called with the scope to snapshot for each record; `stop` ends the walk. */
  onEmit: (scope: ExtractionScope, output?: string) => Promise<EmitOutcome>
}

/** The walk as the control-flow steps see it: options plus the current path. */
export interface StepWalk extends StepWalkOptions {
  path:     string
  runSteps: (steps: readonly Step[], scope: ExtractionScope, path: string) => Promise<EmitOutcome>
}

/**
 * Walks a step list in order. Control flow (`forEach`, `paginate`, `emit`,
 * `set`, `hook`, `when`, error policies) is handled here; leaf steps go to the
 * runner. Mode-agnostic: the same walk drives a browser page or an HTTP context.
 *
 * @param steps - The steps.
 * @param scope - The scope to run in.
 * @param options - Recipe, runner, hooks, events and the emit callback.
 * @param path - Where these steps are, for messages and events.
 * @returns `stop` when the emit callback asked to stop.
 * @throws StepFailure when a step fails under the `fail` policy.
 */
export async function runSteps (steps: readonly Step[], scope: ExtractionScope, options: StepWalkOptions, path = 'steps'): Promise<EmitOutcome> {
  for (const [index, step] of steps.entries()) {
    if (step.when !== undefined && !isTruthy(render(step.when, lookupIn(scope)))) continue
    const at = `${path}.${index}`
    const walk: StepWalk = { ...options, path: at, runSteps: (inner, innerScope, innerPath) => runSteps(inner, innerScope, options, innerPath) }
    const outcome = await runWithPolicy(step, scope, walk)
    if (outcome === 'stop') return 'stop'
  }

  return 'continue'
}

async function runWithPolicy (step: Step, scope: ExtractionScope, walk: StepWalk): Promise<EmitOutcome> {
  const policy = resolveErrorPolicy(step, walk.recipe)
  const attempts = policy.policy === 'retry' ? policy.attempts : 1
  for (let attempt = 1; ; attempt += 1) {
    const started = Date.now()
    walk.events.emit({ type: 'step:start', recipeId: walk.recipe.id, stepType: step.type, path: walk.path })
    try {
      const outcome = await runOne(step, scope, walk)
      walk.events.emit({ type: 'step:finish', recipeId: walk.recipe.id, stepType: step.type, path: walk.path, durationMs: Date.now() - started })

      return outcome
    } catch (error) {
      if (error instanceof StepFailure) throw error
      const message = error instanceof Error ? error.message : String(error)
      if (policy.policy === 'retry' && attempt < attempts) {
        walk.events.emit({ type: 'step:retry', recipeId: walk.recipe.id, stepType: step.type, path: walk.path, attempt: attempt + 1, error: message })
        await sleep(backoffFor(policy, attempt + 1))
        continue
      }
      if (policy.policy === 'skip') {
        walk.events.emit({ type: 'step:skip', recipeId: walk.recipe.id, stepType: step.type, path: walk.path, error: message })

        return 'continue'
      }
      throw new StepFailure(walk.path, step.type, error)
    }
  }
}

async function runOne (step: Step, scope: ExtractionScope, walk: StepWalk): Promise<EmitOutcome> {
  switch (step.type) {
    case 'forEach': { return runForEach(step, scope, walk)
    }
    case 'paginate': { return runPaginate(step, scope, walk)
    }
    case 'emit': { return walk.onEmit(scope, step.output)
    }
    case 'set': {
      if (step.id !== undefined) scope.set(step.id, typeof step.value === 'string' ? render(step.value, lookupIn(scope)) : step.value)

      return 'continue'
    }
    case 'hook': {
      const hook = walk.hooks.resolve(step.name)
      const result = await hook(undefined, renderArgs(step.args ?? {}, scope), { recipeId: walk.recipe.id, scope: scope.snapshot(), log: logThrough(walk) })
      if (step.id !== undefined) scope.set(step.id, result)

      return 'continue'
    }
    default: {
      await walk.runner.runLeaf(step, scope)

      return 'continue'
    }
  }
}

function lookupIn (scope: ExtractionScope): (path: string) => unknown {
  return path => scope.lookup(path)
}

function renderArgs (args: Record<string, unknown>, scope: ExtractionScope): Record<string, unknown> {
  return Object.fromEntries(Object.entries(args).map(([name, value]) => [name, typeof value === 'string' ? render(value, lookupIn(scope)) : value]))
}

function logThrough (walk: StepWalk): (level: 'debug' | 'info' | 'warn' | 'error', message: string, meta?: Record<string, unknown>) => void {
  return (level, message, meta) => {
    walk.events.emit({ type: level === 'error' ? 'error' : 'warning', recipeId: walk.recipe.id, message: `[${level}] ${message}`, meta })
  }
}
