/** One problem in how an input recipe binds to its output recipe. */
export interface BindingIssue {
  recipeId: string
  /** Where in the input recipe: `mapping.price`, `steps.1.steps.0`, `session.bootstrap.steps.2`. */
  path:     string
  message:  string
}

/** An input recipe that parses but cannot feed its output recipe. */
export class RecipeBindingError extends Error {
  override readonly name = 'RecipeBindingError'

  constructor (readonly issues: readonly BindingIssue[]) {
    super(`recipes do not bind\n${issues.map(issue => `  ${issue.recipeId} ${issue.path}: ${issue.message}`).join('\n')}`)
  }
}
