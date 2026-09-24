import type { Page } from 'playwright'
import type { ExtractionScope } from '../extraction-scope'
import type { EvaluateStep } from '../recipe-schema'

/**
 * Runs an `evaluate` step: the script is evaluated in the page as an expression
 * (a function expression is called), and its JSON-serialisable result is bound
 * under the step id. Trusted recipes only: this is arbitrary code in the page.
 */
export async function evaluateScript (step: EvaluateStep, page: Page, scope: ExtractionScope): Promise<void> {
  const result = await page.evaluate(step.script)
  if (step.id !== undefined) scope.set(step.id, result)
}
