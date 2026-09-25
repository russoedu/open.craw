import type { BlockRule } from '../recipe-schema'
import { BlockedError } from './blocked.error'

/** A block unless a recipe says otherwise: forbidden, rate limited, or an AWS WAF challenge (IMDb answers 202 with it). */
export const DEFAULT_BLOCK_RULE: BlockRule = { status: [403, 429], header: { 'x-amzn-waf-action': 'challenge' } }

/** The parts of a response a block rule reads. The body is read only when the rule has a `text` condition. */
export interface ObservedResponse {
  url:     string
  status:  number
  /** Header names in lower case, as Playwright reports them. */
  headers: Record<string, string>
  text?:   () => Promise<string>
}

/**
 * Whether a response is a block.
 *
 * @param response - What came back.
 * @param rule - The recipe's `session.blockedWhen`; `DEFAULT_BLOCK_RULE` when omitted.
 * @returns The error to throw, or `undefined` when the response is not a block.
 */
export async function detectBlock (response: ObservedResponse, rule: BlockRule = DEFAULT_BLOCK_RULE): Promise<BlockedError | undefined> {
  if (rule.status?.includes(response.status) === true) return new BlockedError(response.url, response.status, `HTTP ${response.status}`)
  const headers = Object.entries(rule.header ?? {})
  for (const [name, pattern] of headers) {
    const value = response.headers[name.toLowerCase()]
    if (value !== undefined && new RegExp(pattern, 'i').test(value)) return new BlockedError(response.url, response.status, `${name.toLowerCase()}: ${value}`)
  }
  if (rule.text !== undefined && response.text !== undefined) {
    let body = ''
    try {
      body = await response.text()
    } catch {
      // a body that cannot be read (a redirect, a download) cannot match
    }
    const pattern = new RegExp(rule.text, 'i')
    if (pattern.test(body)) return new BlockedError(response.url, response.status, `body matches /${rule.text}/i`)
  }

  return undefined
}
