/** A response the recipe's `session.blockedWhen` rule (or the default one) says is the site refusing the crawl. */
export class BlockedError extends Error {
  override readonly name = 'BlockedError'

  constructor (readonly url: string, readonly status: number, readonly reason: string) {
    super(`blocked at ${url}: ${reason}`)
  }
}
