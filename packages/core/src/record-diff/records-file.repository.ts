import { readFile } from 'node:fs/promises'
import type { StoredRecord } from './record-diff.algorithm'

/**
 * The records of a JSON Lines file, as a sink wrote them.
 *
 * @param path - The file.
 * @returns One record per non-empty line.
 * @throws Error naming the file and the line that is not a JSON object.
 */
export async function readRecordsFile (path: string): Promise<StoredRecord[]> {
  const text = await readFile(path, 'utf8')
  const records: StoredRecord[] = []
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    if (line.trim() === '') continue
    let value: unknown
    try {
      value = JSON.parse(line)
    } catch (error) {
      throw new Error(`${path}:${index + 1}: not JSON (${(error as Error).message})`, { cause: error })
    }
    if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(`${path}:${index + 1}: not a record (a JSON object)`)
    records.push(value as StoredRecord)
  }

  return records
}
