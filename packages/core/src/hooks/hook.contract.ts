/** Severity of a message a hook logs. Typed here so hooks stay a leaf slice. */
export type HookLogLevel = 'debug' | 'info' | 'warn' | 'error'

/** What a hook knows about where it runs. */
export interface HookContext {
  recipeId: string
  /** The extracted values visible at the call site, child scopes shadowing parents. */
  scope:    Record<string, unknown>
  log:      (level: HookLogLevel, message: string, meta?: Record<string, unknown>) => void
}

/**
 * A programmatic handler a recipe references by name, from a `hook` step
 * (`input` is `undefined`) or a `hook` transform (`input` is the value so far).
 */
export type Hook = (input: unknown, args: Record<string, unknown>, context: HookContext) => unknown

/** Hooks by the name recipes use. */
export type HookMap = Record<string, Hook>
