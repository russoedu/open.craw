import type { ErrorPolicy, InputRecipe, Step } from '../recipe-schema'

const FAIL: ErrorPolicy = { policy: 'fail' }

/**
 * The policy for a failing step: the step's own, else the recipe's, else `fail`.
 *
 * @param step - The step that failed.
 * @param recipe - Its recipe.
 * @returns The policy to apply.
 */
export function resolveErrorPolicy (step: Step, recipe: Pick<InputRecipe, 'onError'>): ErrorPolicy {
  return step.onError ?? recipe.onError ?? FAIL
}

/**
 * How long to wait before a retry: linear backoff.
 *
 * @param policy - A retry policy.
 * @param attempt - The attempt about to be made, starting at 2.
 * @returns Milliseconds.
 */
export function backoffFor (policy: Extract<ErrorPolicy, { policy: 'retry' }>, attempt: number): number {
  return (policy.backoffMs ?? 0) * (attempt - 1)
}

export function sleep (ms: number): Promise<void> {
  return ms <= 0 ? Promise.resolve() : new Promise(resolve => setTimeout(resolve, ms))
}
