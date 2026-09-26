import type { RecipeSet } from '../recipe-loading'
import type { SinkSummary } from '../record-sink'
import type { CrawlReport, RecipeReport } from './crawl-report.model'
import { runInputRecipe } from './run-input-recipe.use-case'
import type { RecipeRunDependencies } from './run-input-recipe.use-case'

/**
 * Runs every input recipe of a set into one sink, `parallel` at a time
 * (default one after another). Reports come back in the set's order whatever
 * order the recipes finish in. Under `onRecipeError: 'stop'`, a failed recipe
 * stops the ones not started yet; those already running finish.
 *
 * @param set - The bound recipes.
 * @param deps - Shared browser, hooks, events, sink and de-duplication.
 * @param onRecipeError - Whether a failed recipe stops the run.
 * @param parallel - How many input recipes run at once.
 * @returns The report.
 */
export async function runCrawl (set: RecipeSet, deps: RecipeRunDependencies, onRecipeError: 'continue' | 'stop', parallel = 1): Promise<CrawlReport> {
  const started = Date.now()
  await deps.sink.open(set.output)
  const reports: (RecipeReport | undefined)[] = []
  let sink: SinkSummary
  try {
    let next = 0
    let stopped = false
    const lane = async (): Promise<void> => {
      while (!stopped && next < set.inputs.length) {
        const index = next
        next += 1
        const report = await runInputRecipe(set.inputs[index], set.output, deps)
        reports[index] = report
        if (onRecipeError === 'stop' && report.error !== undefined) stopped = true
      }
    }
    const lanes = Math.max(1, Math.min(parallel, set.inputs.length))
    await Promise.all(Array.from({ length: lanes }, lane))
  } finally {
    sink = await deps.sink.close()
  }
  const recipes = reports.filter(report => report !== undefined)

  return { outputId: set.output.id, recipes, records: recipes.reduce((total, report) => total + report.emitted, 0), sink, durationMs: Date.now() - started }
}
