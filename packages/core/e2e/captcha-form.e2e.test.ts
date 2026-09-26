import type { Server } from 'node:http'
import type { Page } from 'playwright'
import { createCrawler, loadRecipes, manualCaptchaSolver, memorySink } from '../src/index'
import type { CaptchaChallenge, CaptchaSolver, CaptchaVerdict, CrawlEvent } from '../src/index'
import { browserConfig, FIXTURE_BASE, startFixtureSite, stopFixtureSite } from './fixture-site'

let site: Server
beforeAll(async () => { site = await startFixtureSite() })
afterAll(async () => { await stopFixtureSite(site) })

const output = { kind: 'output', id: 'row', version: 1, fields: { name: { type: 'string', key: true, required: true } } }

/** The form captcha step as a recipe for the Vahan-shaped report writes it. */
function captchaStep (solver: string, submit: unknown[] = [{ type: 'click', selector: '#applyTrigger' }]): Record<string, unknown> {
  return {
    type:     'captcha',
    solver,
    image:    '#captchaImage',
    refresh:  '#captchaImg',
    field:    '#externalCaptcha',
    submit,
    verify:   { selector: '#makerDynamicReportHeader', failure: '#captchaMsg' },
    attempts: 4,
  }
}

function recipe (variant: string, steps: unknown[]): Record<string, unknown> {
  return {
    kind:   'input',
    id:     'report',
    output: 'row',
    mode:   'web',
    start:  [{ url: `${FIXTURE_BASE}/form-captcha?variant=${variant}` }],
    vars:   { q: 'panda' },
    steps:  [
      { type: 'goto', url: '{{start.url}}', ready: { selector: '#captchaImage' } },
      { type: 'fill', selector: '#q', value: '{{vars.q}}' },
      ...steps,
      { type: 'extract', id: 'names', selector: '#rows .item', kind: 'css', many: true },
      { type: 'forEach', over: 'names', as: 'name', emit: true, steps: [] },
    ],
    mapping: { name: { from: 'name' } },
  }
}

/** The code the visitor's image shows, asked of the fixture with the page's own cookies. */
async function answerOf (page: Page): Promise<string> {
  const response = await page.request.get(`${FIXTURE_BASE}/form-captcha/answer`)

  return response.text()
}

/** A reader that types wrong codes for the first `wrong` attempts, then the right one, and records what it was given and told. */
function reader (wrong: number, seen: CaptchaChallenge[], verdicts: CaptchaVerdict[]): CaptchaSolver {
  return {
    name:  'reader',
    solve: async (challenge, { page, attempt }) => {
      seen.push(challenge)
      if (challenge.field === undefined) return { status: 'failed', reason: 'no field' }
      await page.locator(challenge.field).fill(attempt <= wrong ? 'zzzzzz' : await answerOf(page))

      return { status: 'solved' }
    },
    verdict: (_challenge, verdict) => {
      verdicts.push(verdict)
      if (verdict.status === 'rejected') throw new Error('audit log is full')
    },
  }
}

async function crawl (input: Record<string, unknown>, solvers: CaptchaSolver[]): Promise<{ records: unknown[], events: CrawlEvent[], error?: string }> {
  const sink = memorySink()
  const events: CrawlEvent[] = []
  const crawler = createCrawler({ browser: browserConfig(), sink, captchaSolvers: solvers, onEvent: (event) => { events.push(event) } })
  try {
    const report = await crawler.run(await loadRecipes([output, input]))

    return { records: sink.records.map(({ data }) => data.name), events, error: report.recipes[0].error }
  } finally {
    await crawler.close()
  }
}

describe('form captcha, checked when the form is posted (real chromium)', () => {
  it('hands the solver the field and refresh control, submits, reads refusals at once, tells the verdict, and retries on the new image', async () => {
    const seen: CaptchaChallenge[] = []
    const verdicts: CaptchaVerdict[] = []
    const started = Date.now()
    const { records, events, error } = await crawl(recipe('keep', [captchaStep('reader')]), [reader(2, seen, verdicts)])
    expect(error).toBeUndefined()
    expect(records).toEqual(['panda-1', 'panda-2'])
    expect(seen).toHaveLength(3)
    expect(seen[0]).toMatchObject({ kind: 'image', field: '#externalCaptcha', refresh: '#captchaImg' })
    expect(verdicts).toEqual([
      { status: 'rejected', reason: 'the page refused it: "Invalid CAPTCHA."' },
      { status: 'rejected', reason: 'the page refused it: "Invalid CAPTCHA."' },
      { status: 'solved' },
    ])
    // The second refusal came on a page that already showed the message: it counts because the page is new, not by timeout.
    expect(Date.now() - started).toBeLessThan(15_000)
    expect(events.filter(event => event.type === 'captcha:failed')).toHaveLength(2)
    expect(events.filter(event => event.type === 'warning' && event.message.includes('audit log is full'))).toHaveLength(2)
  }, 60_000)

  it('runs the submit steps on every attempt, so a form that empties itself after a wrong code is filled again', async () => {
    const seen: CaptchaChallenge[] = []
    const { records, error } = await crawl(recipe('clear', [
      captchaStep('reader', [{ type: 'fill', selector: '#q', value: '{{vars.q}}' }, { type: 'click', selector: '#applyTrigger' }]),
    ]), [reader(1, seen, [])])
    expect(error).toBeUndefined()
    expect(records).toEqual(['panda-1', 'panda-2'])
  }, 60_000)

  it('gives up after its attempts, with the refusal as the reason', async () => {
    const { records, error } = await crawl(recipe('keep', [{ ...captchaStep('reader'), attempts: 2 }]), [reader(9, [], [])])
    expect(records).toEqual([])
    expect(error).toMatch(/not solved after 2 attempts: the page refused it: "Invalid CAPTCHA."/)
  }, 60_000)

  it('waits for a person with the manual solver, and does not submit what they submitted', async () => {
    // The "person": types the code and presses Apply a moment after the solver starts waiting.
    const human: CaptchaSolver = {
      ...manualCaptchaSolver,
      name:  'human',
      solve: (challenge, context) => {
        setTimeout(() => {
          void (async (): Promise<void> => {
            await context.page.locator('#externalCaptcha').fill(await answerOf(context.page))
            await context.page.locator('#applyTrigger').click()
          })()
        }, 300)

        return manualCaptchaSolver.solve(challenge, context)
      },
    }
    const { records, events, error } = await crawl(recipe('keep', [
      // Submit steps that would fail if run: the person submitted already.
      captchaStep('human', [{ type: 'click', selector: '#no-such-button' }]),
    ]), [human])
    expect(error).toBeUndefined()
    expect(records).toEqual(['panda-1', 'panda-2'])
    expect(events.some(event => event.type === 'warning' && event.message.startsWith('[human] waiting for a person to solve the image captcha'))).toBe(true)
  }, 60_000)
})
