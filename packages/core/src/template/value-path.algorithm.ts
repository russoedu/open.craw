/**
 * Reads and writes values by dotted path (`seller.name`, `items.0.url`, `items[0].url`).
 * Pure: the read never throws on a missing segment, the write creates what is missing.
 */

const INDEX = /\[(\d+)\]/g

/**
 * Splits a path into its segments; `a.b[0].c` and `a.b.0.c` are the same path.
 *
 * @param path - The dotted path.
 * @returns Its segments, `[]` for an empty path or `.`.
 */
export function segmentsOf (path: string): string[] {
  const normalised = path.replaceAll(INDEX, '.$1')

  return normalised.split('.').filter(segment => segment !== '')
}

/**
 * Reads a value by path. Only own properties are read, so `constructor`,
 * `__proto__`, `toString` and the like resolve to `undefined` whatever the data.
 *
 * @param source - Where to read from.
 * @param path - The dotted path; `.` or `''` returns the source itself.
 * @returns The value, or `undefined` when any segment is missing.
 */
export function getPath (source: unknown, path: string): unknown {
  let current: unknown = source
  for (const segment of segmentsOf(path)) {
    if (current === null || current === undefined) return undefined
    if (typeof current !== 'object' || !Object.hasOwn(current, segment)) return undefined
    current = (current as Record<string, unknown>)[segment]
  }

  return current
}

/**
 * Writes a value by path, creating intermediate objects (or arrays for numeric segments).
 *
 * @param target - The object to write into. Mutated.
 * @param path - The dotted path.
 * @param value - The value to store.
 */
export function setPath (target: Record<string, unknown>, path: string, value: unknown): void {
  const segments = segmentsOf(path)
  if (segments.length === 0) return
  let current: Record<string, unknown> = target
  for (const [index, segment] of segments.entries()) {
    if (index === segments.length - 1) {
      current[segment] = value

      return
    }
    const next = current[segment]
    if (next === null || next === undefined || typeof next !== 'object') {
      const created: Record<string, unknown> | unknown[] = /^\d+$/.test(segments[index + 1]) ? [] : {}
      current[segment] = created
      current = created as Record<string, unknown>
    } else {
      current = next as Record<string, unknown>
    }
  }
}
