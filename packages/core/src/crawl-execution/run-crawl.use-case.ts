import type { RecipeSet } from '../recipe-loading'
import type { SinkSummary } from '../record-sink'
import type { CrawlReport, RecipeReport } from './crawl-report.model'
import { runInputRecipe } from './run-input-recipe.use-case'
import type { RecipeRunDependencies } from './run-input-recipe.use-case'

/**
 * Runs every input recipe of a set, one after another, into one sink.
 *
 * @param set - The bound recipes.
 * @param deps - Shared browser, hooks, events, sink and de-duplication.
 * @param onRecipeError - Whether a failed recipe stops the run.
 * @returns The report.
 */
export async function runCrawl (set: RecipeSet, deps: RecipeRunDependencies, onRecipeError: 'continue' | 'stop'): Promise<CrawlReport> {
  const started = Date.now()
  await deps.sink.open(set.output)
  const recipes: RecipeReport[] = []
  let sink: SinkSummary
  try {
    for (const input of set.inputs) {
      const report = await runInputRecipe(input, set.output, deps)
      recipes.push(report)
      if (onRecipeError === 'stop' && report.error !== undefined) break
    }
  } finally {
    sink = await deps.sink.close()
  }

  return { outputId: set.output.id, recipes, records: recipes.reduce((total, report) => total + report.emitted, 0), sink, durationMs: Date.now() - started }
}
