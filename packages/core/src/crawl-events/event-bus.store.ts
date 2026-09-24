import type { CrawlEventInput, CrawlListener } from './crawl-event.contract'

/** Fans crawl events out to listeners. A listener that throws never breaks the crawl. */
export class EventBus {
  private readonly listeners = new Set<CrawlListener>()

  constructor (listener?: CrawlListener) {
    if (listener !== undefined) this.listeners.add(listener)
  }

  /** @returns A function that removes the listener. */
  subscribe (listener: CrawlListener): () => void {
    this.listeners.add(listener)

    return () => { this.listeners.delete(listener) }
  }

  emit (input: CrawlEventInput): void {
    const event = { ...input, at: new Date().toISOString() }
    for (const listener of this.listeners) {
      try {
        listener(event)
      } catch {
        // A faulty listener is the caller's problem, not the crawl's.
      }
    }
  }
}
