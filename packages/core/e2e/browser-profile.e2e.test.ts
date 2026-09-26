import { once } from 'node:events'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import type { Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createCrawler, loadRecipes } from '../src/index'
import type { CrawlReport } from '../src/index'
import { browserConfig, FIXTURE_BASE, startFixtureSite, stopFixtureSite } from './fixture-site'

let site: Server
let profilesDir: string
beforeAll(async () => {
  site = await startFixtureSite()
  profilesDir = await mkdtemp(join(tmpdir(), 'opencraw-profiles-'))
})
afterAll(async () => {
  await stopFixtureSite(site)
  await rm(profilesDir, { recursive: true, force: true })
})

const output = { kind: 'output', id: 'first-product', version: 1, fields: { name: { type: 'string', key: true, required: true } } }

const login = {
  keep:  ['cookies'],
  steps: [
    { type: 'goto', url: `${FIXTURE_BASE}/login` },
    { type: 'fill', selector: '#user', value: 'demo' },
    { type: 'fill', selector: '#pass', value: 'demo' },
    { type: 'click', selector: '#remember' },
    { type: 'click', selector: 'button[type=submit]' },
    { type: 'wait', selector: '#logged-in' },
  ],
}

/** Reads the first product of the API that needs the login cookie. */
function apiRecipe (id: string, session: Record<string, unknown>): Record<string, unknown> {
  return {
    kind:    'input',
    id,
    output:  'first-product',
    mode:    'api',
    start:   [{ url: `${FIXTURE_BASE}/api/products` }],
    session,
    steps:   [{ type: 'request', url: '{{start.url}}', as: 'json' }, { type: 'extract', id: 'name', selector: '$.items[0].name', kind: 'jsonpath' }, { type: 'emit' }],
    mapping: { name: { from: 'name' } },
  }
}

/** The same, read in the browser: the page shows the API's JSON. */
function webRecipe (id: string, session: Record<string, unknown>): Record<string, unknown> {
  return {
    kind:    'input',
    id,
    output:  'first-product',
    mode:    'web',
    start:   [{ url: `${FIXTURE_BASE}/api/products` }],
    session,
    steps:   [{ type: 'goto', url: '{{start.url}}' }, { type: 'extract', id: 'name', selector: '"name":"([^"]+)"', kind: 'regex' }, { type: 'emit' }],
    mapping: { name: { from: 'name' } },
  }
}

async function crawl (recipes: unknown[]): Promise<CrawlReport> {
  const crawler = createCrawler({ browser: browserConfig(), profilesDir, dedupe: 'recipe' })
  try {
    return await crawler.run(await loadRecipes([output, ...recipes]))
  } finally {
    await crawler.close()
  }
}

function outcomes (report: CrawlReport): unknown[] {
  return report.recipes.map(recipe => [recipe.recipeId, recipe.emitted, recipe.error])
}

describe('persistent browser profiles (real chromium)', () => {
  it('keeps a login made in a profile for the next crawler, in web and api mode', async () => {
    const first = await crawl([webRecipe('log-in', { browserProfile: 'shop', bootstrap: login })])
    expect(outcomes(first)).toEqual([['log-in', 1, undefined]])
    expect(await readdir(profilesDir)).toEqual(['shop'])
    // A new crawler, no bootstrap: the profile still holds the remembered login cookie.
    const again = await crawl([webRecipe('web-again', { browserProfile: 'shop' }), apiRecipe('api-again', { browserProfile: 'shop' })])
    expect(outcomes(again)).toEqual([['web-again', 1, undefined], ['api-again', 1, undefined]])
    // Another profile starts empty, so the API refuses it.
    const fresh = await crawl([apiRecipe('fresh', { browserProfile: 'other' })])
    expect(fresh.recipes[0].error).toContain('HTTP 401')
  }, 90000)

  it('refuses a profile another browser holds open', async () => {
    // The holder signals once its page is open in the profile, then keeps it for three more seconds.
    const signal = new EventTarget()
    const holderOpen = once(signal, 'open')
    const first = createCrawler({ browser: browserConfig(), profilesDir, onEvent: (event) => { if (event.type === 'page:visit') signal.dispatchEvent(new Event('open')) } })
    const second = createCrawler({ browser: browserConfig(), profilesDir })
    const slow = { ...webRecipe('holder', { browserProfile: 'busy', bootstrap: login }), steps: [{ type: 'goto', url: '{{start.url}}' }, { type: 'wait', ms: 3000 }, { type: 'extract', id: 'name', selector: '"name":"([^"]+)"', kind: 'regex' }, { type: 'emit' }] }
    try {
      const holding = first.run(await loadRecipes([output, slow]))
      await holderOpen
      const refused = await second.run(await loadRecipes([output, webRecipe('intruder', { browserProfile: 'busy' })]))
      expect(refused.recipes[0].error).toContain('browser profile "busy" is open in another browser')
      expect(outcomes(await holding)).toEqual([['holder', 1, undefined]])
    } finally {
      await first.close()
      await second.close()
    }
  }, 60000)
})
