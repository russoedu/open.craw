/**
 * `{{ }}` interpolation for recipe strings. A placeholder is a dotted path
 * resolved through the lookup the caller provides, or an expression over such
 * paths (see `expression.algorithm`). No code is ever executed.
 */

import { evaluateExpression, parseExpression } from './expression.algorithm'
import { stringify } from './value-text.algorithm'
import type { Lookup } from './value-text.algorithm'

const PLACEHOLDER = /\{\{([^{}]*)\}\}/g
const WHOLE = /^\{\{([^{}]*)\}\}$/
const ANY_PLACEHOLDER = /\{\{[^{}]*\}\}/
/** A placeholder that is a plain path (hyphens and `@` allowed, as in `item.display-name` or `ld.@type`), or empty: resolved directly. */
const PLAIN_PATH = /^[\w@$.[\]-]*$/

/**
 * Whether a string contains at least one placeholder.
 *
 * @param text - The string.
 * @returns `true` when it has a `{{ }}`.
 */
export function hasPlaceholder (text: string): boolean {
  return ANY_PLACEHOLDER.test(text)
}

/**
 * Renders a template. When the template is exactly one placeholder the resolved
 * value is returned as is (so a list or a number survives); otherwise every
 * placeholder is stringified into the text, `undefined`/`null` as `''`.
 *
 * @param template - The string to render.
 * @param lookup - Resolves a path.
 * @returns The rendered value.
 */
export function render (template: string, lookup: Lookup): unknown {
  const whole = WHOLE.exec(template)
  if (whole !== null) return resolve(whole[1].trim(), lookup)

  return template.replaceAll(PLACEHOLDER, (_, inner: string) => stringify(resolve(inner.trim(), lookup)))
}

/**
 * The value of one placeholder: a plain path is looked up as is; anything else
 * is parsed and evaluated as an expression.
 *
 * @param inner - The trimmed text between the braces.
 * @param lookup - Resolves a path.
 * @returns The value.
 * @throws Error when an expression does not parse.
 */
export function resolve (inner: string, lookup: Lookup): unknown {
  if (PLAIN_PATH.test(inner)) return lookup(inner)

  return evaluateExpression(parseExpression(inner), lookup)
}

/**
 * Renders every string inside a JSON-shaped value (an object, an array, or a
 * string) with {@link render}, so a lone placeholder keeps its type
 * (`"{{vars.limit}}"` becomes the number) and anything else becomes text.
 * Numbers, booleans and `null` pass through untouched.
 *
 * @param value - The value.
 * @param lookup - Resolves a path.
 * @returns A new value with every string rendered.
 */
export function renderDeep (value: unknown, lookup: Lookup): unknown {
  if (typeof value === 'string') return render(value, lookup)
  if (Array.isArray(value)) return value.map((item: unknown) => renderDeep(item, lookup))
  if (typeof value === 'object' && value !== null) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, renderDeep(item, lookup)]))

  return value
}

/**
 * Renders a template that must produce text.
 *
 * @param template - The string to render.
 * @param lookup - Resolves a path.
 * @returns The rendered text; a non-string single value is stringified.
 */
export function renderText (template: string, lookup: Lookup): string {
  return stringify(render(template, lookup))
}
