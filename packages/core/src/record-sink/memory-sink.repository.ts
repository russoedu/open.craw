import type { OutputRecord } from '../output-mapping'
import type { RecordSink, SinkSummary } from './record-sink.contract'

/** A sink that keeps records in memory; `records` is readable at any time. */
export interface MemorySink extends RecordSink {
  readonly records: OutputRecord[]
}

/** @returns A new in-memory sink. */
export function memorySink (): MemorySink {
  const records: OutputRecord[] = []

  return {
    records,
    open:  async () => {},
    write: async (record) => { records.push(record) },
    has:   async key => records.some(record => record.key === key),
    close: async (): Promise<SinkSummary> => ({ written: records.length }),
  }
}
