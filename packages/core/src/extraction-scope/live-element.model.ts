/**
 * A snapshot of one element a `forEach` over `selector` iterates: what it held
 * when the loop started, plus where to find it again. The engine never keeps a
 * handle to the element itself: `selector` and `index` re-resolve it on every
 * use, so a re-render between iterations does not break the loop.
 */
export interface LiveElement {
  /** The selector the loop matched, already rendered. */
  selector: string
  /** Position among the matches, from 0. */
  index:    number
  /** Text content, whitespace collapsed. */
  text:     string
  /** Inner HTML. */
  html:     string
  /** Every attribute, by name. */
  attrs:    Record<string, string>
  /** The `value` of an input, option or select; absent otherwise. */
  value?:   string
}

/**
 * Whether a value is a live element snapshot (a `target` template rendered to one).
 *
 * @param value - Anything a template rendered.
 * @returns `true` for an object with a `selector` string and an `index` number.
 */
export function isLiveElement (value: unknown): value is LiveElement {
  return typeof value === 'object' && value !== null && typeof (value as LiveElement).selector === 'string' && typeof (value as LiveElement).index === 'number'
}
