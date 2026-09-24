import { ApiStepRunner } from '../api-steps'
import type { BrowserClient } from '../browser-session'
import type { EventBus } from '../crawl-events'
import { ExtractionScope } from '../extraction-scope'
import type { HookRegistry } from '../hooks'
import { HttpClient } from '../http-session'
import { mapRecord, RecordRejectedError } from '../output-mapping'
import type { InputRecipe, OutputRecipe } from '../recipe-schema'
import type { DedupePolicy, RecordSink } from '../record-sink'
import { runSteps } from '../step-flow'
import type { EmitOutcome, StepRunner } from '../step-flow'
import { WebStepRunner } from '../web-steps'
import { resolveStorageState } from './bootstrap-session.use-case'
import type { RecipeReport } from './crawl-report.model'

export interface RecipeRunDependencies {
  browser:          () => Promise<BrowserClient>
  hooks:            HookRegistry
  events:           EventBus
  sink:             RecordSink
  dedupe:           DedupePolicy
  storageStateDir?: string
}

/**
 * Runs one input recipe end to end: session, runner, the step walk, and for
 * every emitted scope the mapping, de-duplication and the sink. A step or
 * mapping failure under the `fail` policy ends the recipe and is reported,
 * never thrown: the caller decides whether the run goes on.
 *
 * @param input - The input recipe.
 * @param output - The output recipe it feeds.
 * @param deps - Shared browser, hooks, events, sink and de-duplication.
 * @returns What happened.
 */
export async function runInputRecipe (input: InputRecipe, output: OutputRecipe, deps: RecipeRunDependencies): Promise<RecipeReport> {
  const started = Date.now()
  const report: RecipeReport = { recipeId: input.id, mode: input.mode, emitted: 0, rejected: 0, duplicates: 0, pages: 0, durationMs: 0 }
  const unsubscribe = deps.events.subscribe((event) => {
    if (event.type === 'page:visit' && event.recipeId === input.id) report.pages += 1
  })
  deps.events.emit({ type: 'recipe:start', recipeId: input.id, mode: input.mode })
  deps.dedupe.startRecipe()
  let runner: StepRunner | undefined
  try {
    runner = await openRunner(input, deps)
    for (const point of input.start) {
      const scope = new ExtractionScope()
      scope.set('vars', { ...input.vars, ...point.vars })
      scope.set('start', { url: point.url })
      scope.setPage({ url: point.url, number: 1 })
      const outcome = await runSteps(input.steps, scope, {
        recipe: input,
        runner,
        hooks:  deps.hooks,
        events: deps.events,
        onEmit: (emitScope, outputId) => emit(emitScope, outputId, point.url),
      })
      if (outcome === 'stop') break
    }
  } catch (error) {
    report.error = error instanceof Error ? error.message : String(error)
    deps.events.emit({ type: 'error', recipeId: input.id, message: report.error })
  } finally {
    await runner?.dispose()
    unsubscribe()
    report.durationMs = Date.now() - started
    deps.events.emit({ type: 'recipe:finish', recipeId: input.id, emitted: report.emitted, rejected: report.rejected, duplicates: report.duplicates, pages: report.pages, durationMs: report.durationMs, error: report.error })
  }

  return report

  async function emit (scope: ExtractionScope, outputId: string | undefined, startUrl: string): Promise<EmitOutcome> {
    if (outputId !== undefined && outputId !== output.id) throw new Error(`emit names output "${outputId}" but this run produces "${output.id}"`)
    const url = scope.pageState?.url ?? startUrl
    try {
      const record = await mapRecord({ snapshot: scope.snapshot(), input, output, hooks: deps.hooks, url, log: (level, message, meta) => { deps.events.emit({ type: level === 'error' ? 'error' : 'warning', recipeId: input.id, message: `[${level}] ${message}`, meta }) } })
      if (deps.dedupe.isDuplicate(record)) {
        report.duplicates += 1
        deps.events.emit({ type: 'record:duplicate', recipeId: input.id, url, key: record.key ?? '' })
      } else {
        await deps.sink.write(record)
        report.emitted += 1
        deps.events.emit({ type: 'record:emit', recipeId: input.id, url, key: record.key, data: record.data })
      }
    } catch (error) {
      if (!(error instanceof RecordRejectedError)) throw error
      report.rejected += 1
      deps.events.emit({ type: 'record:reject', recipeId: input.id, url, field: error.field, reason: error.reason })
    }
    const limit = input.limits?.maxRecords

    return limit !== undefined && report.emitted >= limit ? 'stop' : 'continue'
  }
}

async function openRunner (input: InputRecipe, deps: RecipeRunDependencies): Promise<StepRunner> {
  const storageState = await resolveStorageState(input, deps)
  const session = input.session
  if (input.mode === 'web') {
    const browser = await deps.browser()
    const browserSession = await browser.newSession({ storageState, cookies: session?.cookies, headers: session?.headers, userAgent: session?.userAgent, viewport: session?.viewport })

    return new WebStepRunner(browserSession, input, deps.events)
  }
  const client = await HttpClient.open({ storageState, headers: session?.headers, userAgent: session?.userAgent, timeoutMs: input.limits?.timeoutMs })

  return new ApiStepRunner(client, input, deps.events)
}
