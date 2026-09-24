/** A transform that could not be applied to its input. */
export class TransformError extends Error {
  override readonly name = 'TransformError'

  constructor (readonly op: string, reason: string, readonly input?: unknown) {
    super(`transform "${op}": ${reason}`)
  }
}
