import type { EventBus } from '../crawl-events'
import type { RetryRule } from '../recipe-schema'
import { sleep } from './retry.policy'
import type { RunGate } from './run-gate.policy'

/** A retry rule with every default filled in. */
export type ResolvedRetryRule = Required<RetryRule>

/** Statuses a server uses for "not now": timeout, too early, too many requests, and the 5xx that pass. */
export const RETRY_STATUSES: readonly number[] = [408, 425, 429, 500, 502, 503, 504]

/** Three tries, one second then two apart, never a wait over 30 seconds. */
export const DEFAULT_RETRY_RULE: ResolvedRetryRule = { attempts: 3, backoffMs: 1000, maxDelayMs: 30_000, statuses: [...RETRY_STATUSES] }

/**
 * Errors that say the connection failed rather than the site answered:
 * resets, refusals, timeouts, a DNS lookup that could not run, a proxy that
 * dropped the tunnel. A name that does not resolve at all (`ENOTFOUND`,
 * `ERR_NAME_NOT_RESOLVED`) is not here: retrying a typo only wastes time.
 */
const TRANSIENT_ERROR = /ECONNRESET|ECONNREFUSED|ETIMEDOUT|EPIPE|EAI_AGAIN|ENETUNREACH|EHOSTUNREACH|socket hang up|net::ERR_(?:CONNECTION_(?:RESET|REFUSED|CLOSED|ABORTED|TIMED_OUT)|TIMED_OUT|EMPTY_RESPONSE|NETWORK_CHANGED|INTERNET_DISCONNECTED|PROXY_CONNECTION_FAILED|TUNNEL_CONNECTION_FAILED|HTTP2_PROTOCOL_ERROR|NETWORK_IO_SUSPENDED)|NS_ERROR_NET_(?:RESET|INTERRUPT|TIMEOUT)|Timeout \d+ms exceeded/

/** Why an attempt may be worth repeating, and the server's own `Retry-After`, if it sent one. */
export interface Transient {
  reason:      string
  retryAfter?: string
}

/** One try of a request, and how to tell a passing failure in what it gave. */
export interface TransportAttempt<T> {
  run:     () => Promise<T>
  /** A transient problem in the outcome (a retry status, a connection error), or `undefined` when the outcome stands. */
  problem: (outcome: { value: T } | { error: unknown }) => Transient | undefined
}

export interface RetryContext {
  recipeId: string
  gate:     RunGate
  events:   EventBus
  rule:     ResolvedRetryRule
}

/**
 * The retry rule a recipe runs with: its `limits.retry` over the crawler's
 * default over `DEFAULT_RETRY_RULE`.
 *
 * @param own - The recipe's `limits.retry`.
 * @param crawler - The crawler's `retry` option.
 * @returns The rule.
 */
export function resolveRetryRule (own?: RetryRule, crawler?: RetryRule): ResolvedRetryRule {
  return { ...DEFAULT_RETRY_RULE, ...definedOf(crawler), ...definedOf(own) }
}

/**
 * Whether an error is a connection failure worth another try.
 *
 * @param error - What the request threw.
 * @returns The reason, or `undefined`.
 */
export function transientError (error: unknown): Transient | undefined {
  const message = error instanceof Error ? error.message : String(error)
  const match = TRANSIENT_ERROR.exec(message)

  return match === null ? undefined : { reason: match[0] }
}

/**
 * How long to wait before attempt `attempt + 1`: the server's `Retry-After`
 * when it gave one, else `backoffMs` doubling per attempt with a little
 * jitter; `undefined` when the server asks for longer than `maxDelayMs` (it
 * means "come back much later", which a crawl cannot wait for).
 *
 * @param rule - The retry rule.
 * @param attempt - The attempt that just failed, from 1.
 * @param retryAfter - The `Retry-After` header: seconds, or an HTTP date.
 * @param now - The current time, for dates.
 * @returns Milliseconds, or `undefined` for no retry.
 */
export function retryDelay (rule: ResolvedRetryRule, attempt: number, retryAfter?: string, now = Date.now()): number | undefined {
  const asked = retryAfterMs(retryAfter, now)
  if (asked !== undefined) return asked > rule.maxDelayMs ? undefined : asked
  const base = rule.backoffMs * 2 ** (attempt - 1)
  const jittered = base * (0.75 + Math.random() * 0.5)

  return Math.min(Math.round(jittered), rule.maxDelayMs)
}

/**
 * Sends a request through the gate (the recipe's rate, the site's lane), and
 * sends it again after a pause while it fails in a passing way, up to
 * `rule.attempts` tries in all. A `Retry-After` holds back every request to
 * that site, not only this one. Each retry is reported as `request:retry`.
 *
 * Like redialling a busy number: wait a moment, dial again, give up after a
 * few tries; and if the other end said "call back in a minute", wait that minute.
 *
 * @param url - Where the request goes.
 * @param attempt - How to send it and how to judge the outcome.
 * @param context - The recipe, gate, events and rule.
 * @returns What the last try gave.
 * @throws What the last try threw.
 */
export async function withTransportRetry<T> (url: string, attempt: TransportAttempt<T>, context: RetryContext): Promise<T> {
  const { rule } = context
  for (let tries = 1; ; tries += 1) {
    const release = await context.gate.request(url)
    let outcome: { value: T } | { error: unknown }
    try {
      outcome = { value: await attempt.run() }
    } catch (error) {
      outcome = { error }
    } finally {
      release()
    }
    const transient = tries < rule.attempts ? attempt.problem(outcome) : undefined
    const delay = transient === undefined ? undefined : retryDelay(rule, tries, transient.retryAfter)
    if (transient === undefined || delay === undefined) {
      if ('error' in outcome) throw outcome.error

      return outcome.value
    }
    if (transient.retryAfter !== undefined) context.gate.hosts?.pause(url, Date.now() + delay)
    context.events.emit({ type: 'request:retry', recipeId: context.recipeId, url, attempt: tries + 1, reason: transient.reason, delayMs: delay })
    await sleep(delay)
  }
}

function retryAfterMs (header: string | undefined, now: number): number | undefined {
  if (header === undefined || header.trim() === '') return undefined
  const seconds = Number(header.trim())
  if (Number.isFinite(seconds)) return Math.max(0, Math.round(seconds * 1000))
  const date = Date.parse(header)

  return Number.isNaN(date) ? undefined : Math.max(0, date - now)
}

function definedOf (rule: RetryRule | undefined): RetryRule {
  return Object.fromEntries(Object.entries(rule ?? {}).filter(([, value]) => value !== undefined))
}
