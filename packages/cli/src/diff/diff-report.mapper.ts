import { readableKey } from '@opencraw/core'
import type { FieldChange, RecordDiff } from '@opencraw/core'

/** Changes listed one by one, at most; the rest are counted. */
const LIST_LIMIT = 50
/** A value longer than this is cut in the report. */
const VALUE_CHARS = 60

/**
 * A diff as people read it: the counts, a warning when the run lost most of
 * its records, then one line per change, `-` removed, `~` changed (with each
 * field's before → after), `+` added.
 *
 * @param diff - The diff.
 * @param limit - Changes listed at most.
 * @returns The lines.
 */
export function diffReport (diff: RecordDiff, limit = LIST_LIMIT): string[] {
  const lines = [`${diff.added} added, ${diff.removed} removed, ${diff.changed} changed, ${diff.unchanged} unchanged (${diff.counts.previous} records before, ${diff.counts.current} now)`]
  if (diff.shrunk !== undefined) lines.push(`! ${diff.shrunk.current} records where the previous run had ${diff.shrunk.previous}: if the source did not shrink, the site may have changed and the recipe no longer finds everything`)
  if (diff.repeated > 0) lines.push(`! ${diff.repeated} records repeat a key already seen and were not compared: is the key complete?`)
  for (const change of diff.changes.slice(0, limit)) {
    const key = readableKey(change.key)
    if (change.change === 'added') lines.push(`+ ${key}`)
    else if (change.change === 'removed') lines.push(`- ${key}`)
    else lines.push(`~ ${key}  ${change.fields.map(field => fieldLine(field)).join('; ')}`)
  }
  if (diff.changes.length > limit) lines.push(`… and ${diff.changes.length - limit} more`)

  return lines
}

function fieldLine (change: FieldChange): string {
  return `${change.field}: ${shown(change.before)} → ${shown(change.after)}`
}

function shown (value: unknown): string {
  const text = JSON.stringify(value) ?? 'null'

  return text.length > VALUE_CHARS ? `${text.slice(0, VALUE_CHARS)}…` : text
}
