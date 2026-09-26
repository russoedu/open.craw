import { randomInt, randomUUID } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'

/**
 * A report form with an image captcha checked only when the form is posted,
 * shaped like the public Vahan report: a full-page POST, "Invalid CAPTCHA." in
 * `#captchaMsg` and a new image on a wrong code, a refresh button, a
 * browser-side check that refuses an empty field (`#captchaError`), and a new
 * captcha for every report. `?variant=clear` empties the form after a wrong
 * code; the default keeps it. `?clip=1` draws the code so its last character
 * is cut off, as the real image sometimes is.
 */

/** The characters codes are drawn from: no 0/O, 1/l/I. */
export const FORM_CAPTCHA_CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
export const FORM_CAPTCHA_LENGTH = 6

/** The code each visitor's current image shows, by the visitor's cookie. */
const codes = new Map<string, string>()

/** A new code from the charset. */
export function newCaptchaCode (): string {
  return Array.from({ length: FORM_CAPTCHA_LENGTH }, () => FORM_CAPTCHA_CHARSET[randomInt(FORM_CAPTCHA_CHARSET.length)]).join('')
}

function visitorOf (incoming: IncomingMessage): string | undefined {
  return /(?:^|;\s*)fc=([\w-]+)/.exec(incoming.headers.cookie ?? '')?.[1]
}

/** The image: bold green text on white, 140×40 like the real one; clipped, the last character runs off the edge. */
export function formCaptchaSvg (code: string, clip: boolean): string {
  return '<svg xmlns="http://www.w3.org/2000/svg" width="140" height="40" viewBox="0 0 140 40"><rect width="140" height="40" fill="#fff"/>' +
    `<text x="${clip ? 9 : 5}" y="30" font-family="DejaVu Sans, Verdana, sans-serif" font-weight="bold" font-size="${clip ? 27 : 25}" fill="#0a6b0a">${code}</text></svg>`
}

function formHtml (action: string, clip: boolean, values: { q: string }, message?: string): string {
  return `<!doctype html><html lang="en"><head><title>Report</title></head><body>
<form id="report" method="post" action="${action}"><label>Query <input id="q" name="q" value="${values.q}"></label>
<input type="hidden" name="captcha" id="hiddenCaptchaField"></form>
<img id="captchaImage" alt="CAPTCHA" width="140" height="40" src="/form-captcha/image?clip=${clip ? 1 : 0}&_ts=${Date.now()}">
<button type="button" id="captchaImg" onclick="document.getElementById('captchaImage').src='/form-captcha/image?clip=${clip ? 1 : 0}&_ts='+Date.now()">&#10227;</button>
<input type="text" id="externalCaptcha" autocomplete="off"><div id="captchaError"></div>
${message === undefined ? '' : `<div id="captchaMsg">${message}</div>`}
<button id="applyTrigger" type="submit" form="report">Apply</button>
<script>document.getElementById('report').addEventListener('submit', function (event) {
  var typed = document.getElementById('externalCaptcha').value
  if (typed === '') { event.preventDefault(); document.getElementById('captchaError').textContent = 'Please enter captcha.'; return }
  document.getElementById('hiddenCaptchaField').value = typed
})</script></body></html>`
}

function reportHtml (action: string, clip: boolean, q: string): string {
  // The report, and the form again under it with a new captcha: every report needs its own.
  return formHtml(action, clip, { q }).replace('<body>', () => `<body><h2 id="makerDynamicReportHeader">Report for ${q}</h2><ul id="rows"><li class="item">${q}-1</li><li class="item">${q}-2</li></ul>`)
}

/**
 * Serves `/form-captcha` (the form, and its POST), `/form-captcha/image` (a
 * new code per request, as the real site draws one) and
 * `/form-captcha/answer` (the visitor's current code, for tests that play a
 * solver).
 *
 * @returns Whether the path was one of these.
 */
export function formCaptchaRoute (incoming: IncomingMessage, outgoing: ServerResponse, url: URL): boolean {
  const visitor = visitorOf(incoming)
  const send = (type: string, body: string, headers: Record<string, string> = {}): void => {
    outgoing.writeHead(200, { 'content-type': type, 'cache-control': 'no-store', ...headers })
    outgoing.end(body)
  }
  const clip = url.searchParams.get('clip') === '1'
  const action = `/form-captcha${url.search}`
  switch (url.pathname) {
    case '/form-captcha': {
      if (incoming.method !== 'POST') {
        send('text/html; charset=utf-8', formHtml(action, clip, { q: '' }), visitor === undefined ? { 'set-cookie': `fc=${randomUUID()}; Path=/` } : {})

        return true
      }
      let body = ''
      incoming.on('data', (chunk: Buffer) => { body += chunk.toString() })
      incoming.on('end', () => {
        const form = new URLSearchParams(body)
        const q = form.get('q') ?? ''
        const expected = visitor === undefined ? undefined : codes.get(visitor)
        if (expected !== undefined && form.get('captcha') === expected) {
          send('text/html; charset=utf-8', reportHtml(action, clip, q))
        } else {
          send('text/html; charset=utf-8', formHtml(action, clip, { q: url.searchParams.get('variant') === 'clear' ? '' : q }, 'Invalid CAPTCHA.'))
        }
      })

      return true
    }
    case '/form-captcha/image': {
      const code = newCaptchaCode()
      if (visitor !== undefined) codes.set(visitor, code)
      send('image/svg+xml', formCaptchaSvg(code, url.searchParams.get('clip') === '1'))

      return true
    }
    case '/form-captcha/answer': {
      send('text/plain', visitor === undefined ? '' : (codes.get(visitor) ?? ''))

      return true
    }
    default: {
      return false
    }
  }
}
