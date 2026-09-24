import type { OutputRecord } from '../output-mapping'
import type { OutputRecipe } from '../recipe-schema'

/** What a sink reports when closed. */
export interface SinkSummary {
  written:   number
  /** Where the records went, when the sink has a location. */
  location?: string
}

/** Where validated records go. Opened once per run, written per record, closed once. */
export interface RecordSink {
  open:  (output: OutputRecipe) => Promise<void>
  write: (record: OutputRecord) => Promise<void>
  close: () => Promise<SinkSummary>
}
