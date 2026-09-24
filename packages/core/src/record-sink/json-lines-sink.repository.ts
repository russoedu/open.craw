import { mkdir, readFile } from 'node:fs/promises'
import { createWriteStream } from 'node:fs'
import type { WriteStream } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { once } from 'node:events'
import type { OutputRecord } from '../output-mapping'
import type { RecordSink, SinkSummary } from './record-sink.contract'

export interface JsonLinesSinkOptions {
  /**
   * Keep what the file holds and add to it. Each line then carries the record
   * key as `_key`, and `open` reads the keys already there so a resumed run
   * (`CrawlOptions.resume`) can skip them.
   */
  append?: boolean
}

/**
 * A sink that writes one JSON object per line to a file (JSON Lines). Each line
 * is the record's `data` plus a `_source` member (and `_key` in append mode).
 *
 * @param path - The file to write; created with its directories, truncated on open unless `append`.
 * @param options - Append mode.
 * @returns The sink.
 */
export function jsonLinesSink (path: string, options: JsonLinesSinkOptions = {}): RecordSink {
  const target = resolve(path)
  const append = options.append === true
  const keys = new Set<string>()
  let stream: WriteStream | undefined
  let written = 0

  return {
    async open () {
      await mkdir(dirname(target), { recursive: true })
      const existing = append ? await existingKeys(target) : []
      for (const key of existing) keys.add(key)
      stream = createWriteStream(target, { encoding: 'utf8', flags: append ? 'a' : 'w' })
      await once(stream, 'open')
    },
    async write (record: OutputRecord) {
      if (stream === undefined) throw new Error('jsonLinesSink: write before open')
      const line = `${JSON.stringify({ ...record.data, _source: record.source, ...(append && record.key !== null && { _key: record.key }) })}\n`
      if (!stream.write(line)) await once(stream, 'drain')
      if (record.key !== null) keys.add(record.key)
      written += 1
    },
    async close (): Promise<SinkSummary> {
      if (stream !== undefined) {
        stream.end()
        await once(stream, 'finish')
        stream = undefined
      }

      return { written, location: target }
    },
    async has (key: string) {
      return keys.has(key)
    },
  }
}

/** The `_key` of every line already in the file; none when the file does not exist. */
async function existingKeys (target: string): Promise<string[]> {
  let content: string
  try {
    content = await readFile(target, 'utf8')
  } catch {
    return []
  }

  return content.split('\n').flatMap((line) => {
    if (line.trim() === '') return []
    try {
      const key = (JSON.parse(line) as { _key?: unknown })._key

      return typeof key === 'string' ? [key] : []
    } catch {
      return []
    }
  })
}
