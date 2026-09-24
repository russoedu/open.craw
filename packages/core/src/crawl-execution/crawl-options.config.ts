import type { BrowserSessionConfig } from '../browser-session'
import type { CrawlListener } from '../crawl-events'
import type { HookMap } from '../hooks'
import type { DedupeScope, RecordSink } from '../record-sink'

/** How a crawler is created. Everything is optional. */
export interface CrawlOptions {
  /** Browser launch settings for web recipes and bootstraps. */
  browser?:         BrowserSessionConfig
  /** Handlers recipes reference by name. */
  hooks?:           HookMap
  /** Where records go; default: kept in memory and returned in the report. */
  sink?:            RecordSink
  onEvent?:         CrawlListener
  /** Default `run`: a key seen once is dropped for the rest of the run. */
  dedupe?:          DedupeScope
  /** Whether a failed input recipe stops the run; default `continue`. */
  onRecipeError?:   'continue' | 'stop'
  /** Base directory for relative `storageStatePath` and `saveTo` values. */
  storageStateDir?: string
  /**
   * Skip records whose key the sink already has (`sink.has`), reporting them as
   * `skipped`. Needs a sink that can answer, such as `jsonLinesSink(path, { append: true })`.
   */
  resume?:          boolean
}
