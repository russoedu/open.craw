import { sleep } from './retry.policy'

/** How gently one site is crawled. */
export interface HostRule {
  /** Minimum time between two request starts to the site, whatever recipe sends them. */
  delayMs?:     number
  /** Requests to the site in flight at once. */
  concurrency?: number
}

/**
 * The crawler's politeness towards each site, across every recipe and run it
 * executes: a default rule for any host, and rules by domain (`example.com`
 * also covers `www.example.com`; the longest match wins).
 */
export interface ThrottleConfig extends HostRule {
  domains?: Record<string, HostRule>
}

interface Bucket {
  rule:      HostRule
  inFlight:  number
  waiting:   (() => void)[]
  /** When the previous request really started: each start waits for it, so a late start pushes the next one back. */
  lastStart: Promise<number>
  /** Until when the site asked to be left alone (`Retry-After`). */
  pausedTo:  number
}

/**
 * Spaces and bounds requests per site, shared by every recipe of a crawler,
 * so two recipes (or two parallel iterations) that hit one site add up to one
 * polite client rather than two. A recipe's own `limits.delayMs` still applies
 * on top, per recipe.
 *
 * Like a single-lane bridge with a traffic light: whoever arrives waits for
 * the car ahead to be far enough, and for a free lane.
 */
export class HostThrottle {
  private readonly buckets = new Map<string, Bucket>()
  private readonly domains: [string, HostRule][]

  constructor (private readonly config: ThrottleConfig = {}) {
    this.domains = Object.entries(config.domains ?? {}).map(([domain, rule]): [string, HostRule] => [domain.toLowerCase().replace(/^\.+/, ''), rule]).sort((first, second) => second[0].length - first[0].length)
  }

  private bucketFor (url: string, always = false): Bucket | undefined {
    const host = hostOf(url)
    if (host === undefined) return undefined
    const match = this.domains.find(([domain]) => host === domain || host.endsWith(`.${domain}`))
    const key = match?.[0] ?? host
    let bucket = this.buckets.get(key)
    if (bucket === undefined) {
      const rule = { ...pick(this.config), ...match?.[1] }
      if (!always && !hasLimit(rule)) return undefined
      bucket = { rule, inFlight: 0, waiting: [], lastStart: Promise.resolve(-Infinity), pausedTo: 0 }
      this.buckets.set(key, bucket)
    }

    return bucket
  }

  /** Whether any rule can hold a request back. */
  get active (): boolean {
    return hasLimit(this.config) || this.domains.some(([, rule]) => hasLimit(rule)) || this.buckets.size > 0
  }

  /**
   * Waits until a request to `url` may start, then holds one of its site's
   * lanes until the returned release is called.
   *
   * @param url - Where the request goes; anything but `http(s):` passes at once.
   * @returns The release: call it once, when the response arrived or the request failed.
   */
  async slot (url: string): Promise<() => void> {
    const bucket = this.bucketFor(url)
    if (bucket === undefined) return noop
    const concurrency = bucket.rule.concurrency ?? Infinity
    if (bucket.inFlight >= concurrency) await new Promise<void>((resolve) => { bucket.waiting.push(resolve) })
    bucket.inFlight += 1
    const previous = bucket.lastStart
    const turn = (async (): Promise<number> => {
      const after = await previous
      // A pause may arrive while waiting (a Retry-After), so check it again after each sleep.
      for (;;) {
        const now = Date.now()
        const at = Math.max(now, after + (bucket.rule.delayMs ?? 0), bucket.pausedTo)
        if (at <= now) return now
        await sleep(at - now)
      }
    })()
    bucket.lastStart = turn
    await turn
    let released = false

    return () => {
      if (released) return
      released = true
      bucket.inFlight -= 1
      bucket.waiting.shift()?.()
    }
  }

  /**
   * Holds every request to the site of `url` back until `untilMs` (a `Retry-After`).
   *
   * @param url - A URL of the site.
   * @param untilMs - An epoch time.
   */
  pause (url: string, untilMs: number): void {
    const bucket = this.bucketFor(url, true)
    if (bucket !== undefined) bucket.pausedTo = Math.max(bucket.pausedTo, untilMs)
  }
}

function noop (): void {}

function hostOf (url: string): string | undefined {
  try {
    const parsed = new URL(url)

    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.hostname.toLowerCase() : undefined
  } catch {
    return undefined
  }
}

function pick (config: ThrottleConfig): HostRule {
  return { delayMs: config.delayMs, concurrency: config.concurrency }
}

function hasLimit (rule: HostRule): boolean {
  return (rule.delayMs ?? 0) > 0 || rule.concurrency !== undefined
}
