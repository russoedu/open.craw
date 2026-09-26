// node --test examples/captcha-solver
// The API is faked; the page part runs in a real Chromium (OPENCRAW_CHROMIUM picks the binary).
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { chromium } from 'playwright'
import { applySolution, capsolver, requestSolution, taskFor } from './capsolver.mjs'

const challenge = { kind: 'recaptcha-v2', url: 'https://shop.example/search', siteKey: 'site-key', selector: '.g-recaptcha >> nth=0' }

/** A fetch that answers from a list and records what it was sent. */
function fakeApi (answers) {
  const sent = []
  const send = async (url, init) => {
    sent.push({ url, body: JSON.parse(init.body) })

    return { json: async () => answers.shift() }
  }

  return { send, sent }
}

describe('taskFor', () => {
  it('builds proxyless tasks by default, and proxy tasks from the lease', async () => {
    assert.deepEqual(await taskFor(challenge), { type: 'ReCaptchaV2TaskProxyLess', websiteURL: challenge.url, websiteKey: 'site-key' })
    assert.deepEqual(await taskFor({ ...challenge, kind: 'recaptcha-v3', action: 'login' }, { proxy: 'http:1.2.3.4:8080:u:p' }), { type: 'ReCaptchaV3Task', websiteURL: challenge.url, websiteKey: 'site-key', pageAction: 'login', proxy: 'http:1.2.3.4:8080:u:p' })
    const turnstile = await taskFor({ ...challenge, kind: 'turnstile' })
    assert.equal(turnstile.type, 'AntiTurnstileTaskProxyLess')
  })

  it('refuses what CapSolver cannot do, and a widget without a site key', async () => {
    await assert.rejects(taskFor({ ...challenge, kind: 'hcaptcha' }), /does not solve hcaptcha/)
    await assert.rejects(taskFor({ ...challenge, siteKey: undefined }), /has no site key/)
    await assert.rejects(taskFor({ ...challenge, kind: 'image' }), /needs imageInput/)
  })
})

describe('requestSolution', () => {
  it('creates the task, then polls until it is ready', async () => {
    const api = fakeApi([{ errorId: 0, taskId: 't1' }, { errorId: 0, status: 'processing' }, { errorId: 0, status: 'ready', solution: { gRecaptchaResponse: 'tok' } }])
    const solution = await requestSolution({ type: 'X' }, { apiKey: 'k', send: api.send, pollMs: 1 })
    assert.deepEqual(solution, { gRecaptchaResponse: 'tok' })
    assert.deepEqual(api.sent.map(({ url, body }) => [url.split('/').at(-1), body.taskId]), [['createTask', undefined], ['getTaskResult', 't1'], ['getTaskResult', 't1']])
    assert.equal(api.sent[0].body.clientKey, 'k')
  })

  it('reports API errors and failed tasks, and stops when aborted', async () => {
    await assert.rejects(requestSolution({}, { apiKey: 'k', send: fakeApi([{ errorId: 1, errorCode: 'ERROR_KEY_DENIED_ACCESS', errorDescription: 'bad key' }]).send }), /ERROR_KEY_DENIED_ACCESS: bad key/)
    await assert.rejects(requestSolution({}, { apiKey: 'k', pollMs: 1, send: fakeApi([{ errorId: 0, taskId: 't' }, { errorId: 0, status: 'failed', errorDescription: 'unsolvable' }]).send }), /could not solve it: unsolvable/)
    const controller = new AbortController()
    controller.abort(new Error('timed out'))
    await assert.rejects(requestSolution({}, { apiKey: 'k', signal: controller.signal, send: fakeApi([{ errorId: 0, taskId: 't' }]).send }), /timed out/)
  })

  it('needs a key', () => {
    assert.throws(() => capsolver({}), /apiKey is required/)
  })
})

describe('applySolution (real chromium)', () => {
  let browser
  before(async () => { browser = await chromium.launch({ executablePath: process.env.OPENCRAW_CHROMIUM || undefined }) })
  after(async () => { await browser?.close() })

  it('fills the response field and calls the widget callback', async () => {
    const page = await browser.newPage()
    await page.setContent('<div class="g-recaptcha" data-sitekey="k" data-callback="done">box</div><textarea name="g-recaptcha-response"></textarea><script>window.got = null; function done (token) { window.got = token }</script>')
    await applySolution({ gRecaptchaResponse: 'tok' }, challenge, page)
    assert.equal(await page.evaluate('window.got'), 'tok')
    assert.equal(await page.inputValue('textarea'), 'tok')
    await page.close()
  })

  it('submits the widget form when there is no callback', async () => {
    const page = await browser.newPage()
    let posted = ''
    await page.route('https://shop.example/verify', async (route) => {
      posted = route.request().postData() ?? ''
      await route.fulfill({ body: '<p>ok</p>', contentType: 'text/html' })
    })
    await page.route('https://shop.example/search', route => route.fulfill({ contentType: 'text/html', body: '<form method="post" action="/verify"><div class="cf-turnstile" data-sitekey="k">box</div><input type="hidden" name="cf-turnstile-response"></form>' }))
    await page.goto('https://shop.example/search')
    await Promise.all([page.waitForURL('**/verify'), applySolution({ token: 'turn' }, { ...challenge, kind: 'turnstile', selector: '.cf-turnstile' }, page)])
    assert.equal(posted, 'cf-turnstile-response=turn')
    await page.close()
  })
})
