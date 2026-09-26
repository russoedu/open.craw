import type { OutputRecipe } from '../recipe-schema'

/** A record as a JSON Lines file holds it: the data, plus the sink's `_source` (and `_key` in append mode). */
export type StoredRecord = Record<string, unknown>

/** One field whose value changed; nested objects are compared field by field (`price.amount`). */
export interface FieldChange {
  field:  string
  before: unknown
  after:  unknown
}

export type RecordChange =
  | { change: 'added', key: string, after: StoredRecord } |
  { change: 'removed', key: string, before: StoredRecord } |
  { change: 'changed', key: string, before: StoredRecord, after: StoredRecord, fields: FieldChange[] }

/** How two runs differ, by record key. */
export interface RecordDiff {
  added:     number
  removed:   number
  changed:   number
  unchanged: number
  /** Every change, removed first, then changed, then added, each in file order. */
  changes:   RecordChange[]
  /** Records on either side the key cannot tell apart from an earlier one: only the first counts. */
  repeated:  number
  /** How many records each side holds. */
  counts:    { previous: number, current: number }
  /** Set when the current run holds far fewer records: the usual sign a site changed and a recipe broke quietly. */
  shrunk?:   { previous: number, current: number }
}

export interface DiffOptions {
  /** The fields that identify a record. Default: the `_key` each line carries (a sink in append mode writes it). */
  key?:    readonly string[]
  /** Fields not compared (their dotted paths match nested ones too). `_source` and `_key` never are. */
  ignore?: readonly string[]
  /** The share of records a run may lose before `shrunk` is set; default 0.5 (half). */
  shrink?: number
}

const BOOKKEEPING = new Set(['_source', '_key'])

/**
 * Compares two runs' records by key: what was added, what was removed, and
 * for the records in both, which fields changed, before and after. Like a
 * `git diff` of a price list, but row by row instead of line by line, so a
 * reordered file is not a change.
 *
 * @param previous - The earlier run's records.
 * @param current - The later run's records.
 * @param options - The key fields, the fields to ignore, the shrink threshold.
 * @returns The differences.
 * @throws Error when records carry no key: without `key`, every line needs `_key`.
 */
export function diffRecords (previous: readonly StoredRecord[], current: readonly StoredRecord[], options: DiffOptions = {}): RecordDiff {
  const ignore = new Set([...BOOKKEEPING, ...(options.ignore ?? [])])
  const keyOf = keyReader(options.key)
  let repeated = 0
  const index = (records: readonly StoredRecord[], side: string): Map<string, StoredRecord> => {
    const byKey = new Map<string, StoredRecord>()
    for (const [line, record] of records.entries()) {
      const key = keyOf(record, `${side} record ${line + 1}`)
      if (byKey.has(key)) repeated += 1
      else byKey.set(key, record)
    }

    return byKey
  }
  const before = index(previous, 'previous')
  const after = index(current, 'current')
  const removed: RecordChange[] = []
  const changed: RecordChange[] = []
  const added: RecordChange[] = []
  let unchanged = 0
  for (const [key, record] of before) {
    const now = after.get(key)
    if (now === undefined) {
      removed.push({ change: 'removed', key, before: record })
      continue
    }
    const fields = fieldChanges(record, now, ignore, '')
    if (fields.length === 0) unchanged += 1
    else changed.push({ change: 'changed', key, before: record, after: now, fields })
  }
  for (const [key, record] of after) {
    if (!before.has(key)) added.push({ change: 'added', key, after: record })
  }
  const threshold = options.shrink ?? 0.5
  const shrunk = previous.length > 0 && current.length < previous.length * (1 - threshold)

  return {
    added:   added.length,
    removed: removed.length,
    changed: changed.length,
    unchanged,
    changes: [...removed, ...changed, ...added],
    repeated,
    counts:  { previous: previous.length, current: current.length },
    ...(shrunk && { shrunk: { previous: previous.length, current: current.length } }),
  }
}

/**
 * The diff options an output recipe implies: its key fields, and its fields
 * the engine fills differently every run (`generated: now`, `uuid`).
 *
 * @param output - The output recipe.
 * @returns The key and the fields to ignore.
 */
export function diffOptionsFor (output: OutputRecipe): Required<Pick<DiffOptions, 'key' | 'ignore'>> {
  const fields = Object.entries(output.fields)

  return {
    key:    fields.filter(([, field]) => field.key === true).map(([name]) => name),
    ignore: fields.filter(([, field]) => field.generated === 'now' || field.generated === 'uuid').map(([name]) => name),
  }
}

/**
 * A key as people read it: the key fields' values joined (`Pandina · 1.0 Hybrid`).
 *
 * @param key - A record key (a JSON array of the key values).
 * @returns The readable form.
 */
export function readableKey (key: string): string {
  try {
    const values = JSON.parse(key) as unknown

    return Array.isArray(values) ? values.map(value => (typeof value === 'string' ? value : JSON.stringify(value))).join(' · ') : key
  } catch {
    return key
  }
}

function keyReader (fields: readonly string[] | undefined): (record: StoredRecord, where: string) => string {
  if (fields !== undefined && fields.length > 0) return record => JSON.stringify(fields.map(field => record[field] ?? null))

  return storedKey
}

/** The `_key` a sink in append mode wrote on the line. */
function storedKey (record: StoredRecord, where: string): string {
  const key = record._key
  if (typeof key !== 'string') throw new Error(`${where} has no _key: name the fields that identify a record (--key model,version, or the output recipe's key fields)`)

  return key
}

function fieldChanges (before: StoredRecord, after: StoredRecord, ignore: ReadonlySet<string>, prefix: string): FieldChange[] {
  const names = [...new Set([...Object.keys(before), ...Object.keys(after)])]
  const changes: FieldChange[] = []
  for (const name of names) {
    const field = `${prefix}${name}`
    if (ignore.has(field) || (prefix === '' && ignore.has(name))) continue
    const was = before[name]
    const is = after[name]
    if (isPlainObject(was) && isPlainObject(is)) changes.push(...fieldChanges(was, is, ignore, `${field}.`))
    else if (!sameValue(was, is)) changes.push({ field, before: was ?? null, after: is ?? null })
  }

  return changes
}

function isPlainObject (value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Equal as JSON, whatever the order of object keys. */
function sameValue (first: unknown, second: unknown): boolean {
  return stableJson(first ?? null) === stableJson(second ?? null)
}

function stableJson (value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(entry => stableJson(entry)).join(',')}]`
  if (isPlainObject(value)) return `{${Object.keys(value).sort((first, second) => first.localeCompare(second)).map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`

  return JSON.stringify(value) ?? 'null'
}
