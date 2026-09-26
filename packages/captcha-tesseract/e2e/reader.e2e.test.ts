import type { Server } from 'node:http'
import { chromium } from 'playwright'
import type { Browser } from 'playwright'
import { createCrawler, loadRecipes, memorySink } from '@opencraw/core'
import type { CrawlEvent } from '@opencraw/core'
import { browserConfig, FIXTURE_BASE, startFixtureSite, stopFixtureSite } from '../../core/e2e/fixture-site'
import { FORM_CAPTCHA_CHARSET, formCaptchaSvg, newCaptchaCode } from '../../core/e2e/form-captcha-site'
import { tesseractReader } from '../src/index'
import type { TesseractRead } from '../src/index'

const SAMPLES = 40

let site: Server
let browser: Browser
beforeAll(async () => {
  site = await startFixtureSite()
  browser = await chromium.launch(browserConfig())
})
afterAll(async () => {
  await browser.close()
  await stopFixtureSite(site)
})

/** Renders captchas the way the site draws them and reads each: how many are right, refused (never submitted), or wrong but submitted. */
async function measure (clip: boolean): Promise<{ right: number, refused: number, wrong: string[] }> {
  const reader = tesseractReader({ charset: FORM_CAPTCHA_CHARSET, length: 6, caseSensitive: true })
  const page = await browser.newPage()
  const tally = { right: 0, refused: 0, wrong: [] as string[] }
  try {
    for (let sample = 0; sample < SAMPLES; sample += 1) {
      const code = newCaptchaCode()
      await page.setContent(`<img id="c" src="data:image/svg+xml;base64,${Buffer.from(formCaptchaSvg(code, clip)).toString('base64')}">`)
      const read = await reader.read(await page.locator('#c').screenshot())
      if (read.problem !== undefined) tally.refused += 1
      else if (read.text === code) tally.right += 1
      else tally.wrong.push(`${code} read ${read.text}`)
    }
  } finally {
    await page.close()
    await reader.close()
  }

  return tally
}

describe('tesseract reader (real chromium, real Tesseract)', () => {
  it('reads most clean codes right, and refuses rather than submits many it cannot read', async () => {
    const clean = await measure(false)
    // Measured when written, over 80 codes: 78% right, 10% refused (refreshed, never submitted), 13% wrong.
    // Mixed-case codes are hard for OCR (k/K, j/J, 8/B look alike); the engine's attempts absorb the misses.
    expect(clean.right).toBeGreaterThanOrEqual(SAMPLES * 0.6)
    expect(clean.wrong.length).toBeLessThanOrEqual(SAMPLES * 0.25)
  }, 120_000)

  it('refuses codes whose last character is cut off far more often than it submits them wrong', async () => {
    const clipped = await measure(true)
    expect(clipped.right + clipped.refused).toBeGreaterThanOrEqual(SAMPLES * 0.6)
  }, 120_000)

  it('solves the form captcha in a crawl: refreshes clipped images, fills the field, and audits every read with its verdict', async () => {
    const reads: TesseractRead[] = []
    const reader = tesseractReader({ name: 'tesseract', charset: FORM_CAPTCHA_CHARSET, length: 6, caseSensitive: true, audit: (read) => { reads.push(read) } })
    const events: CrawlEvent[] = []
    const sink = memorySink()
    const crawler = createCrawler({ browser: browserConfig(), sink, captchaSolvers: [reader], onEvent: (event) => { events.push(event) } })
    const output = { kind: 'output', id: 'row', version: 1, fields: { name: { type: 'string', key: true, required: true } } }
    const input = {
      kind:   'input',
      id:     'report',
      output: 'row',
      mode:   'web',
      start:  [{ url: `${FIXTURE_BASE}/form-captcha?clip=1` }],
      steps:  [
        { type: 'goto', url: '{{start.url}}', ready: { selector: '#captchaImage' } },
        { type: 'fill', selector: '#q', value: 'panda' },
        {
          type:     'captcha',
          solver:   'tesseract',
          image:    '#captchaImage',
          refresh:  '#captchaImg',
          field:    '#externalCaptcha',
          submit:   [{ type: 'click', selector: '#applyTrigger' }],
          verify:   { selector: '#makerDynamicReportHeader', failure: '#captchaMsg' },
          attempts: 5,
        },
        { type: 'extract', id: 'names', selector: '#rows .item', kind: 'css', many: true },
        { type: 'forEach', over: 'names', as: 'name', emit: true, steps: [] },
      ],
      mapping: { name: { from: 'name' } },
    }
    try {
      const report = await crawler.run(await loadRecipes([output, input]))
      expect(report.recipes[0].error).toBeUndefined()
    } finally {
      await crawler.close()
    }
    expect(sink.records.map(({ data }) => data.name)).toEqual(['panda-1', 'panda-2'])
    expect(reads.at(-1)).toMatchObject({ outcome: 'solved', url: `${FIXTURE_BASE}/form-captcha?clip=1` })
    expect(reads.at(-1)?.text).toMatch(/^[\dA-Z]{6}$/i)
    expect(reads.every(read => read.image.length > 0 && read.cleaned.length > 0)).toBe(true)
    // Refreshed reads were never submitted: every captcha:solve attempt submitted one read.
    expect(reads.filter(read => read.outcome !== 'refreshed')).toHaveLength(events.filter(event => event.type === 'captcha:solve').length)
  }, 120_000)
})
