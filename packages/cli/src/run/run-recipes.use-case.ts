import { RecipeBindingError, RecipeSet, RecipeValidationError, createCrawler, diffOptionsFor, diffRecords, jsonLinesSink, memorySink, readRecordsFile, traceLine } from '@opencraw/core'
import type { CrawlEvent, StoredRecord, ThrottleConfig } from '@opencraw/core'
import { diffReport, writeChanges } from '../diff'
import { resolveAccess } from '../access'
import { loadPlugins } from '../hooks-module'
import type { Command } from '../arguments'
import type { Terminal } from '../terminal'
import { loadForRun } from './load-for-run.use-case'

/**
 * Crawls the recipes at `paths` and reports what happened.
 *
 * `--dry-run` caps every input at one record, attaches the scope each record
 * was mapped from, and prints them side by side instead of writing them, so a
 * recipe under construction can be checked without a full run.
 *
 * @param command - The parsed `run` command.
 * @param terminal - Where records, the trace and errors go.
 * @returns The exit code: 0, or 1 on a load failure or a recipe error.
 */
export async function runRecipes (command: Extract<Command, { name: 'run' }>, terminal: Terminal): Promise<number> {
  let set: RecipeSet
  try {
    set = await loadForRun(command.paths, command.only)
  } catch (error) {
    for (const line of loadErrorLines(error)) terminal.err(line)

    return 1
  }
  if (set.inputs.length === 0) {
    terminal.err(command.only.length > 0 ? `no input recipe matches --only ${command.only.join(', ')}` : 'no input recipes found')

    return 1
  }

  let access
  let plugins
  let previous: StoredRecord[] | undefined
  const emitted: StoredRecord[] = []
  try {
    access = await resolveAccess(command.options)
    plugins = command.options.plugins === undefined ? undefined : await loadPlugins(command.options.plugins)
    // Read before the crawl: --diff may name the very file --out is about to overwrite.
    previous = command.diff === undefined ? undefined : await readRecordsFile(command.diff)
  } catch (error) {
    terminal.err(error instanceof Error ? error.message : String(error))

    return 1
  }
  const sink = command.dryRun || (command.out === undefined) ? memorySink() : jsonLinesSink(command.out, { append: command.append })
  const crawler = createCrawler({
    sink,
    access,
    throttle:       throttleFor(command, access?.throttle),
    profilesDir:    command.profiles,
    parallel:       command.parallel,
    retry:          command.retries === undefined ? undefined : { attempts: command.retries },
    hooks:          plugins?.hooks,
    accessPlugins:  plugins?.accessPlugins,
    captchaSolvers: plugins?.captchaSolvers,
    resume:         command.resume,
    debug:          command.dryRun,
    browser:        {
      headless:          !command.headed,
      executablePath:    command.options.browserPath,
      ignoreHTTPSErrors: command.options.insecureTls,
    },
    onEvent: (event) => {
      if (previous !== undefined && event.type === 'record:emit') emitted.push(event.data)
      onEvent(event, command, terminal)
    },
  })
  try {
    const inputs = command.dryRun ? set.inputs.map(input => ({ ...input, limits: { ...input.limits, maxRecords: 1 } })) : set.inputs
    const report = await crawler.run(new RecipeSet(set.output, inputs))
    if (command.out === undefined && !command.dryRun) for (const record of (sink as ReturnType<typeof memorySink>).records) terminal.out(JSON.stringify(record.data))
    for (const recipe of report.recipes) {
      terminal.err(`${recipe.recipeId}: ${recipe.emitted} emitted, ${recipe.rejected} rejected, ${recipe.duplicates} duplicates, ${recipe.skipped} skipped, ${recipe.stepsSkipped > 0 ? `${recipe.stepsSkipped} steps skipped (see --trace), ` : ''}${recipe.pages} pages, ${recipe.durationMs} ms${recipe.error === undefined ? '' : `, stopped: ${recipe.error}`}`)
    }
    if (!command.dryRun) terminal.err(`${report.records} records${report.sink.location === undefined ? '' : ` written to ${report.sink.location}`}`)
    if (previous !== undefined) {
      const diff = diffRecords(previous, emitted, diffOptionsFor(set.output))
      terminal.err(`compared with ${command.diff ?? ''}:`)
      for (const line of diffReport(diff)) terminal.err(`  ${line}`)
      if (command.changes !== undefined) await writeChanges(command.changes, diff)
    }

    return report.recipes.some(recipe => recipe.error !== undefined) ? 1 : 0
  } finally {
    await crawler.close()
  }
}

/** The access config's throttle, with `--host-delay` / `--host-concurrency` over its defaults. */
function throttleFor (command: Extract<Command, { name: 'run' }>, fromConfig: ThrottleConfig | undefined): ThrottleConfig | undefined {
  const { delayMs, concurrency } = command.throttle
  if (delayMs === undefined && concurrency === undefined) return fromConfig

  return { ...fromConfig, ...(delayMs !== undefined && { delayMs }), ...(concurrency !== undefined && { concurrency }) }
}

function onEvent (event: CrawlEvent, command: Extract<Command, { name: 'run' }>, terminal: Terminal): void {
  if (command.trace) {
    const line = traceLine(event)
    if (line !== undefined) terminal.err(line)
  }
  if (command.dryRun && event.type === 'record:emit') {
    terminal.out(`--- ${event.recipeId} ---`)
    terminal.out(`scope: ${JSON.stringify(event.scope, null, 2)}`)
    terminal.out(`record: ${JSON.stringify(event.data, null, 2)}`)
  }
  if (command.dryRun && event.type === 'record:reject') terminal.out(`--- ${event.recipeId}: rejected (${event.field}: ${event.reason}) ---\nscope: ${JSON.stringify(event.scope, null, 2)}`)
}

function loadErrorLines (error: unknown): string[] {
  if (error instanceof RecipeValidationError) return error.issues.map(issue => `${error.source}: ${issue.path === '' ? '(root)' : issue.path}: ${issue.message}`)
  if (error instanceof RecipeBindingError) return error.issues.map(issue => `${issue.recipeId}: ${issue.path}: ${issue.message}`)

  return [error instanceof Error ? error.message : String(error)]
}
