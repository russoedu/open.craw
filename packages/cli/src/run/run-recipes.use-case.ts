import { RecipeBindingError, RecipeSet, RecipeValidationError, createCrawler, jsonLinesSink, memorySink, traceLine } from '@opencraw/core'
import type { CrawlEvent } from '@opencraw/core'
import { resolveAccess } from '../access'
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
  try {
    access = await resolveAccess(command.options)
  } catch (error) {
    terminal.err(error instanceof Error ? error.message : String(error))

    return 1
  }
  const sink = command.dryRun || (command.out === undefined) ? memorySink() : jsonLinesSink(command.out, { append: command.append })
  const crawler = createCrawler({
    sink,
    access,
    resume:  command.resume,
    debug:   command.dryRun,
    browser: {
      headless:          !command.headed,
      executablePath:    command.options.browserPath,
      ignoreHTTPSErrors: command.options.insecureTls,
    },
    onEvent: (event) => onEvent(event, command, terminal),
  })
  try {
    const inputs = command.dryRun ? set.inputs.map(input => ({ ...input, limits: { ...input.limits, maxRecords: 1 } })) : set.inputs
    const report = await crawler.run(new RecipeSet(set.output, inputs))
    if (command.out === undefined && !command.dryRun) for (const record of (sink as ReturnType<typeof memorySink>).records) terminal.out(JSON.stringify(record.data))
    for (const recipe of report.recipes) {
      terminal.err(`${recipe.recipeId}: ${recipe.emitted} emitted, ${recipe.rejected} rejected, ${recipe.duplicates} duplicates, ${recipe.skipped} skipped, ${recipe.pages} pages, ${recipe.durationMs} ms${recipe.error === undefined ? '' : `, stopped: ${recipe.error}`}`)
    }
    if (!command.dryRun) terminal.err(`${report.records} records${report.sink.location === undefined ? '' : ` written to ${report.sink.location}`}`)

    return report.recipes.some(recipe => recipe.error !== undefined) ? 1 : 0
  } finally {
    await crawler.close()
  }
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
