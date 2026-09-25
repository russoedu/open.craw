/** One problem found in a recipe file, located by its JSON path. */
export interface RecipeIssue {
  /** Dotted JSON path, `''` for the root. */
  path:    string
  message: string
}

/** A recipe that does not match its contract. `issues` lists every problem, not just the first. */
export class RecipeValidationError extends Error {
  override readonly name = 'RecipeValidationError'

  constructor (
    /** Which recipe: a file path or an id when known. */
    readonly source: string,
    readonly issues: readonly RecipeIssue[],
  ) {
    super(`${source}: invalid recipe\n${issues.map(issue => `  ${issue.path === '' ? '(root)' : issue.path}: ${issue.message}`).join('\n')}`)
  }
}
