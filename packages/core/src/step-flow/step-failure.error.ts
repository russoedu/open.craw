/** A step that failed under the `fail` policy: the recipe stops here. */
export class StepFailure extends Error {
  override readonly name = 'StepFailure'

  constructor (readonly stepPath: string, readonly stepType: string, cause: unknown) {
    super(`step ${stepPath} (${stepType}) failed: ${cause instanceof Error ? cause.message : String(cause)}`, { cause })
  }
}

/** A single `extract` that matched nothing. */
export class NoMatchError extends Error {
  override readonly name = 'NoMatchError'

  constructor (readonly selector: string) {
    super(`no match for ${selector}`)
  }
}
