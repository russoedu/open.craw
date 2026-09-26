import type { HostThrottle } from './host-throttle.policy'
import { sleep } from './retry.policy'

/**
 * What bounds a recipe run: how many `forEach` iterations may be in flight and
 * how close together requests may start. One gate per recipe run, shared by
 * every loop in it, so nested loops never multiply the limit.
 *
 * Permits go to the outermost concurrent loop: a loop that runs inside an
 * iteration already holding a permit runs its body sequentially (see `nested`),
 * which keeps the total at `permits` and cannot deadlock.
 */
export class RunGate {
  private inFlight = 0
  private readonly waiting: (() => void)[] = []
  private lastStart = -Infinity

  /**
   * @param permits - Iterations allowed in flight; 1 is sequential.
   * @param minIntervalMs - Minimum time between two request starts across the run.
   * @param hosts - The crawler's per-site throttle, shared with every other recipe.
   * @param shared - The throttle state to share (internal: `nested` gates keep their parent's).
   */
  constructor (readonly permits: number, readonly minIntervalMs: number, readonly hosts?: HostThrottle, private readonly shared?: RunGate) {}

  /** Whether this gate lets more than one iteration run at once. */
  get concurrent (): boolean {
    return this.permits > 1
  }

  /**
   * Takes a permit, waiting for one when all are in flight.
   *
   * @returns The release; call it exactly once, when the iteration ends.
   */
  async acquire (): Promise<() => void> {
    if (this.inFlight >= this.permits) await new Promise<void>((resolve) => { this.waiting.push(resolve) })
    this.inFlight += 1
    let released = false

    return () => {
      if (released) return
      released = true
      this.inFlight -= 1
      this.waiting.shift()?.()
    }
  }

  /**
   * Waits until a request may start: `minIntervalMs` after the previous start,
   * whichever loop started it. Returns at once when the interval has passed.
   */
  async throttle (): Promise<void> {
    const state = this.shared ?? this
    if (state.minIntervalMs <= 0) return
    const now = Date.now()
    const at = Math.max(now, state.lastStart + state.minIntervalMs)
    state.lastStart = at
    await sleep(at - now)
  }

  /**
   * Waits until a request to `url` may start: the recipe's interval, then its
   * site's turn in the crawler's per-site throttle.
   *
   * @param url - Where the request goes.
   * @returns The release of the site's lane: call it once the response arrived or the request failed.
   */
  async request (url: string): Promise<() => void> {
    await this.throttle()

    return this.hosts === undefined ? noop : this.hosts.slot(url)
  }

  /** The gate for a body running inside an iteration that holds a permit: sequential, same throttle. */
  nested (): RunGate {
    return new RunGate(1, this.minIntervalMs, this.hosts, this.shared ?? this)
  }
}

function noop (): void {}
