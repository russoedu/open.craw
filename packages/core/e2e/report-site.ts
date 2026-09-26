import type { IncomingMessage, ServerResponse } from 'node:http'

/**
 * A report page whose table the page itself reads from a JSON endpoint, paged
 * with a cursor, as many public report pages do: `/report` sets a
 * session cookie and holds the form; `POST /report/rows` answers only with
 * that cookie, reads the form's fields (url-encoded) plus `pageSize` and
 * `after`, and returns `{ rows, hasMore, next }`.
 */

const MAKERS = ['ASHOK LEYLAND', 'BAJAJ AUTO', 'EICHER', 'HERO', 'MAHINDRA', 'TATA MOTORS', 'TVS']

/** What the last rows request posted, for tests. */
export const reportRequests: URLSearchParams[] = []

const REPORT_PAGE = `<!doctype html><html lang="en"><head><title>Report</title></head><body>
<form id="reportForm" method="post" action="/report">
  <select id="state" name="state" multiple><option value="DL" selected>Delhi</option><option value="KA">Karnataka</option><option value="MH" selected>Maharashtra</option></select>
  <input name="year" value="2026"><input name="archived" value="yes" disabled><input type="hidden" name="token" value="secret">
  <label><input type="checkbox" name="ev" value="1"> EV only</label>
</form></body></html>`

function json (outgoing: ServerResponse, status: number, value: unknown): void {
  outgoing.writeHead(status, { 'content-type': 'application/json' })
  outgoing.end(JSON.stringify(value))
}

export function reportRoute (incoming: IncomingMessage, outgoing: ServerResponse, url: URL): boolean {
  if (url.pathname === '/report' && incoming.method === 'GET') {
    outgoing.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'set-cookie': 'rs=1; Path=/' })
    outgoing.end(REPORT_PAGE)

    return true
  }
  if (url.pathname !== '/report/rows') return false
  let body = ''
  incoming.on('data', (chunk: Buffer) => { body += chunk.toString() })
  incoming.on('end', () => {
    if (!(incoming.headers.cookie ?? '').includes('rs=1')) return json(outgoing, 403, { message: 'session expired' })
    const form = new URLSearchParams(body)
    reportRequests.push(form)
    const size = Number(form.get('pageSize') ?? '25')
    const start = form.get('after') === '' || !form.has('after') ? 0 : MAKERS.indexOf(form.get('after') ?? '') + 1
    const page = MAKERS.slice(start, start + size)
    const hasMore = start + size < MAKERS.length
    json(outgoing, 200, { rows: page.map((maker, index) => ({ maker, states: form.getAll('state').join('+'), total: (start + index + 1) * 10 })), hasMore, next: hasMore ? page.at(-1) : null })
  })

  return true
}
