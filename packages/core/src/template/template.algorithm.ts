/**
 * `{{ path }}` interpolation for recipe strings. No code is ever executed: a
 * placeholder is a dotted path resolved through the lookup the caller provides.
 */

const PLACEHOLDER = /\{\{([^{}]*)\}\}/g
const WHOLE = /^\{\{([^{}]*)\}\}$/
const ANY_PLACEHOLDER = /\{\{[^{}]*\}\}/

/** Resolves a dotted path to a value; `undefined` when unknown. */
export type Lookup = (path: string) => unknown

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
  if (whole !== null) return lookup(whole[1].trim())

  return template.replaceAll(PLACEHOLDER, (_, path: string) => stringify(lookup(path.trim())))
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

/**
 * Truthiness as recipes mean it: `when` and `until` conditions.
 *
 * @param value - Any rendered value.
 * @returns `false` for `undefined`, `null`, `''`, `0`, `false`, `'false'`, `'0'`, `'null'` and an empty list.
 */
export function isTruthy (value: unknown): boolean {
  if ([undefined, null, false, 0].includes(value as null)) return false
  if (typeof value === 'string') return !['', 'false', '0', 'null', 'undefined'].includes(value.trim().toLowerCase())
  if (Array.isArray(value)) return value.length > 0

  return true
}

/**
 * The text form of a value for interpolation.
 *
 * @param value - Any value.
 * @returns A string; objects and arrays as JSON.
 */
export function stringify (value: unknown): string {
  if (value === undefined || value === null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'object') return JSON.stringify(value)

  return String(value)
}
