/** A record that does not satisfy its output recipe and is dropped (policy `skip-record`). */
export class RecordRejectedError extends Error {
  override readonly name = 'RecordRejectedError'

  constructor (readonly field: string, readonly reason: string) {
    super(`record rejected: ${field}: ${reason}`)
  }
}

/** A record that does not satisfy its output recipe under policy `fail`: the recipe stops. */
export class MappingFailedError extends Error {
  override readonly name = 'MappingFailedError'

  constructor (readonly field: string, readonly reason: string, options?: { cause?: unknown }) {
    super(`mapping failed: ${field}: ${reason}`, options)
  }
}
