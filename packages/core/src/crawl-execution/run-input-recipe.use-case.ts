import type { AccessBroker, AccessLease } from '../access'
import { ApiStepRunner } from '../api-steps'
import type { BrowserClient } from '../browser-session'
import type { EventBus } from '../crawl-events'
import { ExtractionScope } from '../extraction-scope'
import type { HookRegistry } from '../hooks'
import { HttpClient } from '../http-session'
import { mapRecord, RecordRejectedError } from '../output-mapping'
import type { InputRecipe, OutputRecipe } from '../recipe-schema'
import type { DedupePolicy, RecordSink } from '../record-sink'
import { RunGate, runSteps } from '../step-flow'
import type { EmitOutcome, StepRunner } from '../step-flow'
import { WebStepRunner } from '../web-steps'
import { accessOptions, resolveStorageState } from './bootstrap-session.use-case'
import type { RecipeReport } from './crawl-report.model'

export interface RecipeRunDependencies {
  browser:            () => Promise<BrowserClient>
  hooks:              HookRegistry
  events:             EventBus
  sink:               RecordSink
  dedupe:             DedupePolicy
  storageStateDir?:   string
  /** Accept invalid TLS certificates in api mode too (sandbox proxies); mirrors `browser.ignoreHTTPSErrors`. */
  ignoreHTTPSErrors?: boolean
  /** Skip records the sink already has (`sink.has`). */
  resume?:            boolean
  /** Attach the scope snapshot to record events. */
  debug?:             boolean
  /** Leases each recipe run its network access. */
  access:             AccessBroker
}

/**
 * Runs one input recipe end to end: session, runner, the step walk, and for
 * every emitted scope the mapping, de-duplication and the sink. A step or
 * mapping failure under the `fail` policy ends the recipe and is reported,
 * never thrown: the caller decides whether the run goes on.
 *
 * Emits are serialised through one promise chain whatever the concurrency, so
 * the sink sees one record at a time and `maxRecords` is exact: once reached,
 * every later emit returns `stop` before mapping.
 *
 * @param input - The input recipe.
 * @param output - The output recipe it feeds.
 * @param deps - Shared browser, hooks, events, sink and de-duplication.
 * @returns What happened.
 */
export async function runInputRecipe (input: InputRecipe, output: OutputRecipe, deps: RecipeRunDependencies): Promise<RecipeReport> {
  const started = Date.now()
  const report: RecipeReport = { recipeId: input.id, mode: input.mode, emitted: 0, rejected: 0, duplicates: 0, skipped: 0, pages: 0, durationMs: 0 }
  const limits = input.limits ?? {}
  // A web recipe drives one page, so only api mode runs iterations in parallel.
  const gate = new RunGate(input.mode === 'web' ? 1 : (limits.concurrency ?? 1), limits.delayMs ?? 0)
  let stopped = false
  let chain: Promise<unknown> = Promise.resolve()
  const unsubscribe = deps.events.subscribe((event) => {
    if (event.type === 'page:visit' && event.recipeId === input.id) report.pages += 1
  })
  deps.events.emit({ type: 'recipe:start', recipeId: input.id, mode: input.mode })
  deps.dedupe.startRecipe()
  let runner: StepRunner | undefined
  let lease: AccessLease | undefined
  try {
    lease = await leaseAccess(input, deps)
    runner = await openRunner(input, deps, gate, lease)
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
        gate,
        onEmit: (emitScope, outputId) => emit(emitScope, outputId, point.url),
      })
      if (outcome === 'stop') break
    }
  } catch (error) {
    report.error = error instanceof Error ? error.message : String(error)
    deps.events.emit({ type: 'error', recipeId: input.id, message: report.error })
  } finally {
    await runner?.dispose()
    await lease?.release?.()
    unsubscribe()
    report.durationMs = Date.now() - started
    deps.events.emit({ type: 'recipe:finish', recipeId: input.id, emitted: report.emitted, rejected: report.rejected, duplicates: report.duplicates, skipped: report.skipped, pages: report.pages, durationMs: report.durationMs, error: report.error })
  }

  return report

  function emit (scope: ExtractionScope, outputId: string | undefined, startUrl: string): Promise<EmitOutcome> {
    if (outputId !== undefined && outputId !== output.id) throw new Error(`emit names output "${outputId}" but this run produces "${output.id}"`)
    const snapshot = scope.snapshot()
    const url = scope.pageState?.url ?? startUrl
    const previous = chain
    const turn = (async (): Promise<EmitOutcome> => {
      try {
        await previous
      } catch {
        // the failed emit already reached its own caller
      }

      return emitOne(snapshot, url)
    })()
    chain = turn

    return turn
  }

  async function emitOne (snapshot: Record<string, unknown>, url: string): Promise<EmitOutcome> {
    if (stopped) return 'stop'
    try {
      const record = await mapRecord({ snapshot, input, output, hooks: deps.hooks, url, log: (level, message, meta) => { deps.events.emit({ type: level === 'error' ? 'error' : 'warning', recipeId: input.id, message: `[${level}] ${message}`, meta }) } })
      if (deps.resume === true && record.key !== null && await deps.sink.has?.(record.key) === true) {
        report.skipped += 1
        deps.events.emit({ type: 'record:skipped', recipeId: input.id, url, key: record.key })
      } else if (deps.dedupe.isDuplicate(record)) {
        report.duplicates += 1
        deps.events.emit({ type: 'record:duplicate', recipeId: input.id, url, key: record.key ?? '' })
      } else {
        await deps.sink.write(record)
        report.emitted += 1
        deps.events.emit({ type: 'record:emit', recipeId: input.id, url, key: record.key, data: record.data, scope: deps.debug === true ? snapshot : undefined })
      }
    } catch (error) {
      if (!(error instanceof RecordRejectedError)) throw error
      report.rejected += 1
      deps.events.emit({ type: 'record:reject', recipeId: input.id, url, field: error.field, reason: error.reason, scope: deps.debug === true ? snapshot : undefined })
    }
    if (limits.maxRecords !== undefined && report.emitted >= limits.maxRecords) stopped = true

    return stopped ? 'stop' : 'continue'
  }
}

/**
 * The recipe run's access lease, announced as an event. A recipe that asks for
 * a country while no profile applies gets a warning rather than silence.
 */
async function leaseAccess (input: InputRecipe, deps: RecipeRunDependencies): Promise<AccessLease> {
  const wanted = input.session?.access
  const lease = await deps.access.lease({ recipeId: input.id, profile: wanted?.profile, country: wanted?.country, sticky: wanted?.sticky })
  deps.events.emit({ type: 'access:lease', recipeId: input.id, profile: lease.profile, kind: lease.kind, server: lease.proxy?.server, session: lease.session })
  if (lease.kind === 'direct' && wanted?.country !== undefined) {
    deps.events.emit({ type: 'warning', recipeId: input.id, message: `session.access.country "${wanted.country}" is ignored: no proxy profile applies to this recipe` })
  }

  return lease
}

async function openRunner (input: InputRecipe, deps: RecipeRunDependencies, gate: RunGate, lease: AccessLease): Promise<StepRunner> {
  const storageState = await resolveStorageState(input, deps, lease)
  const session = input.session
  const access = accessOptions(lease, session?.headers)
  if (input.mode === 'web') {
    const browser = await deps.browser()
    const browserSession = await browser.newSession({ storageState, cookies: session?.cookies, userAgent: session?.userAgent, viewport: session?.viewport, ...access })

    return new WebStepRunner(browserSession, input, deps.events, gate)
  }
  const client = await HttpClient.open({
    storageState,
    headers:           access.headers,
    userAgent:         session?.userAgent,
    timeoutMs:         input.limits?.timeoutMs,
    ignoreHTTPSErrors: deps.ignoreHTTPSErrors === true || access.ignoreHTTPSErrors === true,
    proxy:             access.proxy,
  })

  return new ApiStepRunner(client, input, deps.events, gate)
}
