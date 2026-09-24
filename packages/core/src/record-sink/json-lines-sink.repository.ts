import { mkdir } from 'node:fs/promises'
import { createWriteStream } from 'node:fs'
import type { WriteStream } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { once } from 'node:events'
import type { OutputRecord } from '../output-mapping'
import type { RecordSink, SinkSummary } from './record-sink.contract'

/**
 * A sink that appends one JSON object per line to a file (JSON Lines). Each line
 * is the record's `data` plus a `_source` member.
 *
 * @param path - The file to write; created with its directories, truncated on open.
 * @returns The sink.
 */
export function jsonLinesSink (path: string): RecordSink {
  const target = resolve(path)
  let stream: WriteStream | undefined
  let written = 0

  return {
    async open () {
      await mkdir(dirname(target), { recursive: true })
      stream = createWriteStream(target, { encoding: 'utf8' })
      await once(stream, 'open')
    },
    async write (record: OutputRecord) {
      if (stream === undefined) throw new Error('jsonLinesSink: write before open')
      const line = `${JSON.stringify({ ...record.data, _source: record.source })}\n`
      if (!stream.write(line)) await once(stream, 'drain')
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
  }
}
