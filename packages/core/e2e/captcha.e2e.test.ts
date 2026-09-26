import type { Server } from 'node:http'
import type { Page } from 'playwright'
import { createCrawler, loadRecipes, memorySink } from '../src/index'
import type { CaptchaSolver, CrawlEvent } from '../src/index'
import { browserConfig, CAPTCHA_SITE_KEY, CAPTCHA_TOKEN, FIXTURE_BASE, startFixtureSite, stopFixtureSite } from './fixture-site'

let site: Server
beforeAll(async () => { site = await startFixtureSite() })
afterAll(async () => { await stopFixtureSite(site) })

const output = { kind: 'output', id: 'model', version: 1, fields: { name: { type: 'string', key: true, required: true } } }

const extractModels = [
  { type: 'extract', id: 'names', selector: '#results .item', kind: 'css', many: true },
  { type: 'forEach', over: 'names', as: 'name', emit: true, steps: [] },
]

function recipe (id: string, steps: unknown[], session: Record<string, unknown> = {}): Record<string, unknown> {
  return { kind: 'input', id, output: 'model', mode: 'web', start: [{ url: `${FIXTURE_BASE}/captcha/start` }], session, steps: [...steps, ...extractModels], mapping: { name: { from: 'name' } } }
}

const afterClick = [{ type: 'goto', url: '{{start.url}}' }, { type: 'click', target: '#go' }]

/** Types a token into the widget's response field and submits, as token services' page scripts do. */
async function submit (page: Page, token: string): Promise<void> {
  await Promise.all([
    page.waitForEvent('load'),
    page.locator('#g-recaptcha-response').evaluate((field: HTMLTextAreaElement, value: string) => {
      field.value = value
      field.form?.submit()
    }, token),
  ])
}

/** A solver that answers with `tokens[attempt - 1]` and always claims success: the page decides. */
function solver (name: string, tokens: string[], seen: unknown[] = []): CaptchaSolver {
  return {
    name,
    solve: async (challenge, { page, attempt }) => {
      seen.push(challenge)
      await submit(page, tokens[Math.min(attempt, tokens.length) - 1])

      return { status: 'solved' }
    },
  }
}

async function crawl (recipes: unknown[], solvers: CaptchaSolver[]): Promise<{ records: unknown[], events: CrawlEvent[], report: Awaited<ReturnType<ReturnType<typeof createCrawler>['run']>> }> {
  const sink = memorySink()
  const events: CrawlEvent[] = []
  const crawler = createCrawler({ browser: browserConfig(), sink, captchaSolvers: solvers, onEvent: (event) => { events.push(event) } })
  try {
    const report = await crawler.run(await loadRecipes([output, ...recipes]))

    return { records: sink.records.map(({ data }) => data.name), events, report }
  } finally {
    await crawler.close()
  }
}

function ofType<T extends CrawlEvent['type']> (events: CrawlEvent[], type: T): Extract<CrawlEvent, { type: T }>[] {
  return events.filter((event): event is Extract<CrawlEvent, { type: T }> => event.type === type)
}

describe('captcha solving (real chromium, fake reCAPTCHA)', () => {
  it('solves a challenge a click leads to, retrying when the page does not confirm the first answer', async () => {
    const seen: unknown[] = []
    const { records, events, report } = await crawl([recipe('after-click', afterClick, { captcha: { solver: 'fake' } })], [solver('fake', ['wrong', CAPTCHA_TOKEN], seen)])
    expect(report.recipes[0].error).toBeUndefined()
    expect(records).toEqual(['Pandina', '600e'])
    expect(seen[0]).toMatchObject({ kind: 'recaptcha-v2', siteKey: CAPTCHA_SITE_KEY, url: `${FIXTURE_BASE}/captcha/gate` })
    expect(ofType(events, 'captcha:failed')).toEqual([expect.objectContaining({ attempt: 1, reason: 'the page still shows the challenge' })])
    expect(ofType(events, 'captcha:solved')).toEqual([expect.objectContaining({ attempt: 2, solver: 'fake' })])
    expect(report.recipes[0].captchas).toEqual({ detected: 1, solved: 1, failed: 1 })
  }, 60000)

  it('solves the challenge a block page shows under onBlock.solve', async () => {
    const steps = [{ type: 'goto', url: `${FIXTURE_BASE}/captcha/waf` }]
    const { records, events, report } = await crawl([recipe('waf', steps, { captcha: { solver: 'fake' }, onBlock: { solve: true } })], [solver('fake', [CAPTCHA_TOKEN])])
    expect(report.recipes[0].error).toBeUndefined()
    expect(records).toEqual(['Pandina', '600e'])
    expect(ofType(events, 'captcha:solved')).toHaveLength(1)
  }, 60000)

  it('solves at a captcha step, with no automatic checks', async () => {
    const steps = [...afterClick, { type: 'captcha', solver: 'fake', verify: { selector: '#results' } }]
    const { records, report } = await crawl([recipe('step', steps)], [solver('fake', [CAPTCHA_TOKEN])])
    expect(report.recipes[0].error).toBeUndefined()
    expect(records).toEqual(['Pandina', '600e'])
  }, 60000)

  it('treats a challenge it cannot solve as a block: rotates, then fails the recipe', async () => {
    const failing: CaptchaSolver = { name: 'broke', solve: () => ({ status: 'failed', reason: 'balance is zero' }) }
    // The goto is the step retried after rotating: a fresh session starts on a blank page.
    const steps = [{ type: 'goto', url: `${FIXTURE_BASE}/captcha/gate` }]
    const { records, events, report } = await crawl([recipe('unsolved', steps, { captcha: { solver: 'broke', attempts: 2 }, onBlock: { rotate: true, attempts: 1 } })], [failing])
    expect(records).toEqual([])
    expect(report.recipes[0].error).toContain('captcha (recaptcha-v2) not solved after 2 attempts: balance is zero')
    expect(ofType(events, 'access:rotate')).toHaveLength(1)
    expect(ofType(events, 'captcha:failed')).toHaveLength(4)
  }, 60000)

  it('stops solving once the run spent maxSolves', async () => {
    const failing: CaptchaSolver = { name: 'broke', solve: () => ({ status: 'failed', reason: 'wrong answer' }) }
    const { events, report } = await crawl([recipe('budget', afterClick, { captcha: { solver: 'broke', maxSolves: 1 } })], [failing])
    expect(report.recipes[0].error).toContain('solves are spent')
    expect(ofType(events, 'captcha:solve')).toHaveLength(1)
    expect(ofType(events, 'captcha:budget')).toEqual([expect.objectContaining({ max: 1 })])
  }, 60000)

  it('fails before any page loads when a recipe names a solver nobody registered', async () => {
    const { events, report } = await crawl([recipe('unknown', afterClick, { captcha: { solver: 'nope' } })], [solver('fake', [CAPTCHA_TOKEN])])
    expect(report.recipes[0].error).toContain('captcha solver "nope" is not registered (registered: fake)')
    expect(ofType(events, 'page:visit')).toHaveLength(0)
  })
})
