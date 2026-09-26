import type { Page } from 'playwright'
import type { ExtractionScope } from '../extraction-scope'
import type { EvaluateStep } from '../recipe-schema'
import { renderDeep, renderText } from '../template'

/**
 * Runs an `evaluate` step: the script, rendered as a template, is evaluated in
 * the page as an expression, and its JSON-serialisable result is bound under
 * the step id. With `args`, the script is a function expression called with
 * them, rendered (Playwright passes no argument to a script given as text, so
 * the call is written into the expression, the arguments as JSON). Trusted
 * recipes only: this is arbitrary code in the page.
 */
export async function evaluateScript (step: EvaluateStep, page: Page, scope: ExtractionScope): Promise<void> {
  const lookup = (path: string): unknown => scope.lookup(path)
  const script = renderText(step.script, lookup)
  const expression = step.args === undefined ? script : `(${script})(${JSON.stringify(renderDeep(step.args, lookup))})`
  const result = await page.evaluate(expression)
  if (step.id !== undefined) scope.set(step.id, result)
}
