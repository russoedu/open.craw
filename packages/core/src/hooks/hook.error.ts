/** A recipe named a hook nothing registered. */
export class UnknownHookError extends Error {
  override readonly name = 'UnknownHookError'

  constructor (readonly hookName: string, known: readonly string[]) {
    super(`unknown hook "${hookName}"${known.length === 0 ? ' (no hooks registered)' : `; registered: ${known.join(', ')}`}`)
  }
}
