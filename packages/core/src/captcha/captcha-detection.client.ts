import type { Page } from 'playwright'
import type { CaptchaChallenge, CaptchaKind } from './captcha-solver.contract'

/** The widgets detection looks for when a recipe names none: reCAPTCHA v2, hCaptcha and Turnstile, as a container or as their iframe. */
export const DEFAULT_CAPTCHA_SELECTOR = [
  '.g-recaptcha',
  'iframe[src*="recaptcha/api2/anchor"]',
  'iframe[src*="recaptcha/enterprise/anchor"]',
  '.h-captcha',
  'iframe[src*="hcaptcha.com"]',
  '.cf-turnstile',
  'iframe[src*="challenges.cloudflare.com"]',
].join(', ')

/** reCAPTCHA v3 runs without a widget: its script is loaded with the site key as `render`. */
const RECAPTCHA_V3_SCRIPT = 'script[src*="recaptcha/api.js?render="], script[src*="recaptcha/enterprise.js?render="]'

/** Matches past this many are not looked at: a page does not show more challenges than that. */
const MAX_CANDIDATES = 10

/** What detection reads of a matched element, inside the page. */
interface WidgetFacts {
  tag:       string
  className: string
  src:       string
  siteKey?:  string
  action?:   string
}

/**
 * The first visible challenge on the page, if any. An element counts only
 * when visible: sites keep hidden widgets around after a solve, and an
 * invisible reCAPTCHA shows nothing until it challenges.
 *
 * @param page - The live page.
 * @param selector - Where challenges are; `DEFAULT_CAPTCHA_SELECTOR` when omitted.
 * @param options - `v3`: also report a reCAPTCHA v3 script (a `captcha` step asks for it; the automatic checks do not, since v3 never blocks a page by itself).
 * @returns The challenge, or `undefined`.
 */
export async function detectChallenge (page: Page, selector = DEFAULT_CAPTCHA_SELECTOR, options: { v3?: boolean } = {}): Promise<CaptchaChallenge | undefined> {
  const matches = page.locator(selector)
  const count = Math.min(await matches.count(), MAX_CANDIDATES)
  for (let index = 0; index < count; index += 1) {
    const element = matches.nth(index)
    if (!await element.isVisible()) continue
    const facts = await element.evaluate(readWidget)

    return challengeOf(facts, page.url(), `${selector} >> nth=${index}`)
  }
  if (options.v3 !== true) return undefined
  const script = page.locator(RECAPTCHA_V3_SCRIPT).first()
  if (await script.count() === 0) return undefined
  const src = await script.getAttribute('src') ?? ''
  const siteKey = new URL(src, page.url()).searchParams.get('render') ?? undefined

  return { kind: 'recaptcha-v3', url: page.url(), ...(siteKey !== undefined && siteKey !== 'explicit' && { siteKey }) }
}

/**
 * Whether the page is clear of challenges, tolerating a page that is
 * navigating (a solve often submits a form): an evaluation cut short by the
 * navigation counts as not clear yet.
 *
 * @param page - The live page.
 * @param selector - Where challenges are.
 * @returns Whether no challenge is visible.
 */
export async function isClear (page: Page, selector: string): Promise<boolean> {
  try {
    return await detectChallenge(page, selector) === undefined
  } catch {
    return false
  }
}

/** Runs inside the page. Keep it self-contained; it is serialised. */
function readWidget (element: HTMLElement): WidgetFacts {
  const source = element.getAttribute('src') ?? element.querySelector('iframe')?.getAttribute('src') ?? ''

  return { tag: element.tagName.toLowerCase(), className: element.getAttribute('class') ?? '', src: source, siteKey: element.dataset.sitekey, action: element.dataset.action }
}

function challengeOf (facts: WidgetFacts, url: string, selector: string): CaptchaChallenge {
  const siteKey = facts.siteKey ?? siteKeyIn(facts.src, url)

  return {
    kind: kindOf(facts),
    url,
    selector,
    ...(siteKey !== undefined && { siteKey }),
    ...(facts.action !== undefined && { action: facts.action }),
  }
}

function kindOf (facts: WidgetFacts): CaptchaKind {
  const hint = `${facts.className} ${facts.src}`.toLowerCase()
  if (hint.includes('recaptcha')) return 'recaptcha-v2'
  if (hint.includes('hcaptcha')) return 'hcaptcha'
  if (hint.includes('turnstile') || hint.includes('challenges.cloudflare.com')) return 'turnstile'

  return facts.tag === 'img' || facts.tag === 'canvas' ? 'image' : 'unknown'
}

/** A widget iframe carries its site key in the query: `k` (reCAPTCHA) or `sitekey` (hCaptcha). */
function siteKeyIn (src: string, base: string): string | undefined {
  if (src === '') return undefined
  try {
    const parameters = new URL(src, base).searchParams
    const hashParameters = new URLSearchParams(new URL(src, base).hash.slice(1))

    return parameters.get('k') ?? parameters.get('sitekey') ?? hashParameters.get('sitekey') ?? undefined
  } catch {
    return undefined
  }
}
