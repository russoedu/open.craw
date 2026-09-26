// A captcha solver for OpenCraw backed by CapSolver (https://docs.capsolver.com). It turns a detected
// challenge into a CapSolver task, polls for the answer, and applies it on the live page: the token goes
// into the widget's response field, then the widget's callback runs, or its form is submitted. The engine
// checks the page afterwards, so a token the site rejects counts as a failed attempt.
//
//   import { capsolver } from './captcha-solver/capsolver.mjs'
//   export const captchaSolvers = [capsolver({ apiKey: process.env.CAPSOLVER_KEY })]

const API = 'https://api.capsolver.com'
const POLL_MS = 3000

/**
 * @typedef {object} CapsolverOptions
 * @property {string} apiKey - The CapSolver client key.
 * @property {string} [name] - The name recipes use; `capsolver` by default.
 * @property {boolean} [useProxy] - Solve through the run's proxy (the access lease). Off by default: CapSolver's
 *   workers must reach the proxy, so a local one cannot work.
 * @property {string} [imageInput] - Where to type the text of an image captcha (a selector); image captchas fail without it.
 * @property {number} [pollMs] - How often to ask for the result.
 * @property {string} [api] - The API base URL.
 * @property {typeof fetch} [fetch] - The fetch to use (tests pass a fake one).
 */

/**
 * @param {CapsolverOptions} options - The key and the choices above.
 * @returns {import('@opencraw/core').CaptchaSolver} The solver.
 */
export function capsolver (options) {
  const { apiKey, name = 'capsolver', useProxy = false, imageInput, pollMs = POLL_MS, api = API, fetch: send = fetch } = options
  if (typeof apiKey !== 'string' || apiKey === '') throw new Error('capsolver: an apiKey is required (set CAPSOLVER_KEY)')

  return {
    name,
    async solve (challenge, { page, lease, signal, log }) {
      const task = await taskFor(challenge, { page, proxy: useProxy ? proxyOf(lease) : undefined, imageInput })
      log('info', `capsolver ${task.type} for ${challenge.url}`)
      const solution = await requestSolution(task, { apiKey, api, send, pollMs, signal })
      await applySolution(solution, challenge, page, imageInput)

      return { status: 'solved' }
    },
  }
}

/**
 * The CapSolver task for a challenge.
 *
 * @param {import('@opencraw/core').CaptchaChallenge} challenge - What the engine found.
 * @param {{ page?: import('playwright').Page, proxy?: string, imageInput?: string }} context - The page (for image captchas) and the proxy.
 * @returns {Promise<Record<string, unknown>>} The task.
 */
export async function taskFor (challenge, { page, proxy, imageInput } = {}) {
  const withProxy = (type, fields) => (proxy === undefined ? { type: `${type}ProxyLess`, ...fields } : { type, ...fields, proxy })
  const site = () => ({ websiteURL: challenge.url, websiteKey: siteKeyOf(challenge) })
  switch (challenge.kind) {
    case 'recaptcha-v2': {
      return withProxy('ReCaptchaV2Task', site())
    }
    case 'recaptcha-v3': {
      return withProxy('ReCaptchaV3Task', { ...site(), pageAction: challenge.action ?? 'verify' })
    }
    case 'turnstile': {
      return { type: 'AntiTurnstileTaskProxyLess', ...site(), ...(challenge.action !== undefined && { metadata: { action: challenge.action } }) }
    }
    case 'image': {
      if (imageInput === undefined) throw new Error('an image captcha needs imageInput: where to type its text')
      if (page === undefined || challenge.selector === undefined) throw new Error('an image captcha needs the page and the image')
      const image = await page.locator(challenge.selector).screenshot()

      return { type: 'ImageToTextTask', body: image.toString('base64') }
    }
    default: {
      throw new Error(`CapSolver does not solve ${challenge.kind} challenges: register another solver for them`)
    }
  }
}

/**
 * Creates the task and waits for its solution.
 *
 * @param {Record<string, unknown>} task - From `taskFor`.
 * @param {{ apiKey: string, api?: string, send?: typeof fetch, pollMs?: number, signal?: AbortSignal }} options - Where and how to ask.
 * @returns {Promise<Record<string, unknown>>} The solution: `gRecaptchaResponse`, `token` or `text`.
 */
export async function requestSolution (task, { apiKey, api = API, send = fetch, pollMs = POLL_MS, signal }) {
  const created = await call(send, `${api}/createTask`, { clientKey: apiKey, task }, signal)
  if (created.status === 'ready') return created.solution
  for (;;) {
    await sleep(pollMs, signal)
    const result = await call(send, `${api}/getTaskResult`, { clientKey: apiKey, taskId: created.taskId }, signal)
    if (result.status === 'ready') return result.solution
    if (result.status === 'failed') throw new Error(`CapSolver could not solve it${result.errorDescription ? `: ${result.errorDescription}` : ''}`)
  }
}

/**
 * Applies a solution on the page: an image captcha's text is typed and entered; a token goes into the
 * widget's response fields, then the widget's `data-callback` runs, else its form is submitted.
 *
 * @param {Record<string, unknown>} solution - CapSolver's solution.
 * @param {import('@opencraw/core').CaptchaChallenge} challenge - The challenge.
 * @param {import('playwright').Page} page - The live page.
 * @param {string} [imageInput] - Where an image captcha's text goes.
 * @returns {Promise<void>}
 */
export async function applySolution (solution, challenge, page, imageInput) {
  if (challenge.kind === 'image') {
    await page.fill(imageInput, String(solution.text ?? ''))
    await page.press(imageInput, 'Enter')

    return
  }
  const token = solution.gRecaptchaResponse ?? solution.token
  if (typeof token !== 'string' || token === '') throw new Error('CapSolver returned no token')
  const field = challenge.kind === 'turnstile' ? 'cf-turnstile-response' : 'g-recaptcha-response'
  const widget = challenge.selector === undefined ? page.locator('body') : page.locator(challenge.selector)
  await widget.evaluate(injectToken, { token, field })
}

/** Runs inside the page. Keep it self-contained; it is serialised. */
function injectToken (widget, { token, field }) {
  for (const input of widget.ownerDocument.getElementsByName(field)) input.value = token
  const holder = widget.closest('[data-callback]')
  const callback = holder === null ? undefined : widget.ownerDocument.defaultView[holder.dataset.callback]
  if (typeof callback === 'function') return void callback(token)
  widget.closest('form')?.submit()
}

/** CapSolver's proxy string, `scheme:host:port:user:pass`, from the access lease. */
function proxyOf (lease) {
  if (lease?.proxy === undefined) return
  const url = new URL(lease.proxy.server)
  const parts = [url.protocol.replace(':', ''), url.hostname, url.port]
  if (lease.proxy.username !== undefined) parts.push(lease.proxy.username, lease.proxy.password ?? '')

  return parts.join(':')
}

function siteKeyOf (challenge) {
  if (challenge.siteKey === undefined) throw new Error(`the ${challenge.kind} challenge on ${challenge.url} has no site key`)

  return challenge.siteKey
}

async function call (send, url, body, signal) {
  const response = await send(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal })
  const payload = await response.json()
  if (payload.errorId !== 0 && payload.errorId !== undefined) throw new Error(`CapSolver ${payload.errorCode ?? 'error'}: ${payload.errorDescription ?? 'no description'}`)

  return payload
}

function sleep (ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason)
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => {
      clearTimeout(timer)
      reject(signal.reason)
    }, { once: true })
  })
}
