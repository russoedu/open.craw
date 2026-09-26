import { writeFile } from 'node:fs/promises'
import { diffRecords, readRecordsFile } from '@opencraw/core'
import type { RecordDiff } from '@opencraw/core'
import type { Command } from '../arguments'
import type { Terminal } from '../terminal'
import { diffReport } from './diff-report.mapper'

/**
 * Compares two runs' JSON Lines files and prints what changed; with
 * `--changes`, writes every change as a JSON line too.
 *
 * @param command - The parsed `diff` command.
 * @param terminal - Where the report goes.
 * @returns The exit code: 0, or 1 when a file cannot be read or has no key.
 */
export async function diffFiles (command: Extract<Command, { name: 'diff' }>, terminal: Terminal): Promise<number> {
  try {
    const [previous, current] = await Promise.all([readRecordsFile(command.previous), readRecordsFile(command.current)])
    const diff = diffRecords(previous, current, { key: command.key.length === 0 ? undefined : command.key, ignore: command.ignore })
    for (const line of diffReport(diff)) terminal.out(line)
    if (command.changes !== undefined) await writeChanges(command.changes, diff)

    return 0
  } catch (error) {
    terminal.err(error instanceof Error ? error.message : String(error))

    return 1
  }
}

/**
 * Writes a diff's changes as JSON Lines: `{ change, key, before?, after?, fields? }`.
 *
 * @param path - The file.
 * @param diff - The diff.
 */
export async function writeChanges (path: string, diff: RecordDiff): Promise<void> {
  await writeFile(path, diff.changes.map(change => `${JSON.stringify(change)}\n`).join(''))
}
