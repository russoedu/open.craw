import { expandCharset } from '../charset'
import { cleanImage } from '../image-cleanup'
import { fixLetterCase } from './letter-case.algorithm'
import { judgeRead } from './read-check.policy'
import type { ChallengeLike, ImageRead, PageLike, SolveContextLike, SolveOutcome, SolveVerdict, TesseractRead, TesseractReader, TesseractReaderOptions } from './reader.contract'
import { TesseractEngine } from './tesseract-engine.client'

const DEFAULT_REFRESHES = 5
const DEFAULT_MIN_CONFIDENCE = 50
const DEFAULT_TIMEOUT_MS = 60_000
/** An image counts as settled once its `src` stayed the same this long. */
const SETTLE_MS = 300
const SETTLE_LIMIT_MS = 5000

/**
 * A captcha reader for OpenCraw's form captchas: it reads the code in the
 * challenge's image with Tesseract, refreshes the image while the read is not
 * good enough (wrong length, an unsure character, and no form is posted for
 * that), fills the challenge's answer field, and returns `solved`. The engine
 * posts the form, checks the page and tells the verdict, which goes to
 * `audit` with the read.
 *
 * @param options - The charset, the length, the checks, the cleanup, the audit.
 * @returns The reader, to register as a captcha solver.
 */
export function tesseractReader (options: TesseractReaderOptions = {}): TesseractReader {
  const caseSensitive = options.caseSensitive ?? false
  const characters = expandCharset(options.charset ?? 'A-Za-z0-9', caseSensitive)
  const rules = { characters, length: options.length, minConfidence: options.minConfidence ?? DEFAULT_MIN_CONFIDENCE }
  const engine = new TesseractEngine({ lang: options.lang ?? 'eng', langPath: options.langPath, whitelist: characters, pageSegMode: options.pageSegMode ?? 7 })
  const refreshes = options.refreshes ?? DEFAULT_REFRESHES
  /** The read an attempt submitted, waiting for the page's verdict. */
  const submitted = new WeakMap<ChallengeLike, TesseractRead>()

  const audit = async (read: TesseractRead, context?: SolveContextLike): Promise<void> => {
    try {
      await options.audit?.(read)
    } catch (error) {
      context?.log('warn', `audit failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const read = async (png: Buffer): Promise<ImageRead> => {
    const started = Date.now()
    const cleaned = cleanImage(png, options.preprocess)
    const { raw, symbols: read } = await engine.read(cleaned)
    // Tesseract sees one line with no size reference: the case of same-shape letters is put right by their size.
    const symbols = caseSensitive ? fixLetterCase(read, characters) : read
    const judged = judgeRead(caseSensitive ? symbols.map(symbol => symbol.text).join('') : raw, symbols, rules)

    return { ...judged, raw, symbols, image: png, cleaned, durationMs: Date.now() - started }
  }

  const solve = async (challenge: ChallengeLike, context: SolveContextLike): Promise<SolveOutcome> => {
    const { page, signal } = context
    if (challenge.selector === undefined) return { status: 'failed', reason: `a ${challenge.kind} challenge has no image to read` }
    if (challenge.field === undefined) return { status: 'failed', reason: 'the captcha step names no field for the answer' }
    let problem = 'no read'
    for (let attempt = 1; attempt <= refreshes; attempt += 1) {
      if (signal.aborted) break
      await settle(page, challenge.selector)
      const result = await read(await page.locator(challenge.selector).first().screenshot())
      const record: TesseractRead = { ...result, url: challenge.url, attempt: context.attempt, read: attempt, outcome: 'refreshed' }
      if (result.problem === undefined) {
        await page.locator(challenge.field).first().fill(result.text)
        submitted.set(challenge, record)
        context.log('debug', `read "${result.text}" (${result.confidence}%)`)

        return { status: 'solved' }
      }
      problem = result.problem
      await audit({ ...record, reason: problem }, context)
      if (attempt === refreshes || challenge.refresh === undefined) break
      context.log('debug', `refreshing the image: ${problem}`)
      await page.locator(challenge.refresh).first().click()
    }

    return { status: 'failed', reason: `no good read after ${refreshes} image${refreshes === 1 ? '' : 's'}: ${problem}` }
  }

  return {
    name:      options.name ?? 'tesseract',
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    solve,
    read,
    async verdict (challenge: ChallengeLike, verdict: SolveVerdict): Promise<void> {
      const record = submitted.get(challenge)
      if (record === undefined) return
      submitted.delete(challenge)
      await audit(verdict.status === 'solved' ? { ...record, outcome: 'solved' } : { ...record, outcome: 'rejected', reason: verdict.reason })
    },
    close: () => engine.close(),
  }
}

/**
 * Waits for the image to settle: its `src` unchanged for a moment and the
 * element visible. Changing a filter can make a page draw a new captcha in
 * the background; reading the old one would submit a stale code.
 */
async function settle (page: PageLike, selector: string): Promise<void> {
  const image = page.locator(selector).first()
  const deadline = Date.now() + SETTLE_LIMIT_MS
  let source = await image.getAttribute('src')
  for (;;) {
    await page.waitForTimeout(SETTLE_MS)
    const now = await image.getAttribute('src')
    if (Date.now() >= deadline || (now === source && await image.isVisible())) return
    source = now
  }
}
