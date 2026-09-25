/** An access config that cannot work: a bad profile, an unknown preset or plugin, a missing parameter or environment variable. */
export class AccessConfigError extends Error {
  override readonly name = 'AccessConfigError'
}
