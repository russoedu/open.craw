import type { TransformRule } from '../recipe-schema'
import { transformFor } from './transform-registry.store'
import type { TransformContext } from './transform-registry.store'

/** The ops that run when the value so far is missing; every other op passes a missing value through. */
const RUNS_ON_MISSING = new Set<TransformRule['op']>(['default', 'template', 'hook'])

/**
 * Applies a chain of transforms in order. A scalar op applied to a list runs
 * on every item; a list op runs on the list itself. A missing value (`undefined`
 * or `null`) passes through every op except `default`, `template` and `hook`,
 * so a missing source reaches the missing-value policy untouched. Async because
 * a `hook` may be.
 *
 * @param value - The resolved source value(s).
 * @param rules - The chain.
 * @param context - Lookup, hooks and the base URL.
 * @returns The transformed value.
 * @throws TransformError (or whatever a hook throws) when a step cannot apply.
 */
export async function applyTransformChain (value: unknown, rules: readonly TransformRule[], context: TransformContext): Promise<unknown> {
  let current = value
  for (const rule of rules) {
    if ((current === undefined || current === null) && !RUNS_ON_MISSING.has(rule.op)) continue
    const transform = transformFor(rule)
    current = transform.elementwise && Array.isArray(current)
      ? await Promise.all(current.map(item => transform.apply(item, rule, context)))
      : await transform.apply(current, rule, context)
  }

  return current
}
