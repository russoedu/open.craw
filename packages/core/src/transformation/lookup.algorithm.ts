import { dataItemsOf } from '../selection'
import { getPath } from '../template'

/**
 * The first item of a table whose `key` path equals a value, compared as text
 * so `"3"` finds `3`. The table is whatever a bound id holds: data, JSON text
 * or a list of JSON texts (a `data-*` attribute per element).
 *
 * @param value - The value to find.
 * @param table - The table, as bound in scope.
 * @param key - A dotted path inside each item.
 * @param pick - A dotted path to return from the item; the item itself when omitted.
 * @returns The picked value, or `undefined` when nothing matches.
 */
export function lookup (value: unknown, table: unknown, key: string, pick?: string): unknown {
  if (value === undefined || value === null) return undefined
  const wanted = String(value)
  const found = dataItemsOf(table).find(item => sameText(getPath(item, key), wanted))
  if (found === undefined) return undefined

  return pick === undefined ? found : getPath(found, pick)
}

/**
 * Groups a list by a path, keeping first-seen order.
 *
 * @param items - The list.
 * @param by - A dotted path inside each item; items without one group under `null`.
 * @returns One `{ key, items }` per distinct key.
 */
export function group (items: unknown[], by: string): { key: unknown, items: unknown[] }[] {
  const groups = new Map<string, { key: unknown, items: unknown[] }>()
  const ordered: { key: unknown, items: unknown[] }[] = []
  for (const item of items) {
    const raw = getPath(item, by)
    const key = raw === undefined ? null : raw
    const id = typeof key === 'string' ? key : JSON.stringify(key)
    let bucket = groups.get(id)
    if (bucket === undefined) {
      bucket = { key, items: [] }
      groups.set(id, bucket)
      ordered.push(bucket)
    }
    bucket.items.push(item)
  }

  return ordered
}

function sameText (candidate: unknown, wanted: string): boolean {
  if (candidate === undefined || candidate === null) return false

  return String(candidate) === wanted
}
