import { createServer, request as httpRequest } from 'node:http'
import type { IncomingMessage, Server } from 'node:http'
import { connect } from 'node:net'
import type { Duplex } from 'node:stream'

/**
 * A minimal authenticating forward proxy for the e2e runs: plain `http://`
 * requests by absolute URI and HTTPS by `CONNECT`, basic auth with a fixed
 * password, and a log of which username asked for which URL. Enough to prove
 * that browser pages, bootstraps and HTTP requests all go through the proxy an
 * access profile names, with the session the lease rendered.
 */
export const PROXY_PORT = Number(process.env.OPENCRAW_PROXY_PORT ?? '4645')

export interface ProxyHit {
  username: string
  method:   string
  url:      string
}

export interface ForwardProxy {
  server:        Server
  hits:          ProxyHit[]
  /** The next username the proxy has not seen is treated as a blocked IP: its page requests get 403 "Access Denied". */
  blockNextUser: () => void
}

const CHALLENGE = 'Basic realm="OpenCraw e2e"'

function credentialsOf (incoming: IncomingMessage): { username: string, password: string } | undefined {
  const header = incoming.headers['proxy-authorization']
  if (header?.startsWith('Basic ') !== true) return undefined
  const decoded = Buffer.from(header.slice('Basic '.length), 'base64').toString('utf8')
  const colon = decoded.indexOf(':')

  return colon === -1 ? undefined : { username: decoded.slice(0, colon), password: decoded.slice(colon + 1) }
}

/**
 * Starts the proxy.
 *
 * @param password - The only password it accepts; `undefined` for an open proxy that logs every caller as `anonymous`.
 * @param port - Where it listens.
 * @returns The server and its hit log.
 */
export async function startForwardProxy (password: string | undefined, port = PROXY_PORT): Promise<ForwardProxy> {
  const hits: ProxyHit[] = []
  const seen = new Set<string>()
  const blocked = new Set<string>()
  let blockNext = false
  const server = createServer((incoming, outgoing) => {
    const credentials = password === undefined ? { username: 'anonymous', password } : credentialsOf(incoming)
    if (credentials === undefined || credentials.password !== password) {
      outgoing.writeHead(407, { 'proxy-authenticate': CHALLENGE })
      outgoing.end()

      return
    }
    const target = new URL(incoming.url ?? '/')
    hits.push({ username: credentials.username, method: incoming.method ?? 'GET', url: target.href })
    if (!seen.has(credentials.username)) {
      seen.add(credentials.username)
      if (blockNext) blocked.add(credentials.username)
      blockNext = false
    }
    if (blocked.has(credentials.username)) {
      outgoing.writeHead(403, { 'content-type': 'text/html' })
      outgoing.end('<!doctype html><html lang="en"><body><h1>Access Denied</h1></body></html>')

      return
    }
    const headers = { ...incoming.headers }
    delete headers['proxy-authorization']
    delete headers['proxy-connection']
    const upstream = httpRequest({ host: target.hostname, port: target.port, path: `${target.pathname}${target.search}`, method: incoming.method, headers }, (response) => {
      outgoing.writeHead(response.statusCode ?? 502, response.headers)
      response.pipe(outgoing)
    })
    upstream.on('error', () => {
      if (!outgoing.headersSent) outgoing.writeHead(502)
      outgoing.end()
    })
    incoming.pipe(upstream)
  })
  server.on('connect', (incoming: IncomingMessage, client: Duplex, head: Buffer) => {
    const credentials = password === undefined ? { username: 'anonymous', password } : credentialsOf(incoming)
    if (credentials === undefined || credentials.password !== password) {
      client.end(`HTTP/1.1 407 Proxy Authentication Required\r\nProxy-Authenticate: ${CHALLENGE}\r\n\r\n`)

      return
    }
    hits.push({ username: credentials.username, method: 'CONNECT', url: incoming.url ?? '' })
    const [host, port] = (incoming.url ?? '').split(':', 2)
    const upstream = connect(Number(port), host, () => {
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n')
      upstream.write(head)
      upstream.pipe(client)
      client.pipe(upstream)
    })
    upstream.on('error', () => client.destroy())
    client.on('error', () => upstream.destroy())
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', resolve)
  })

  return { server, hits, blockNextUser: () => { blockNext = true } }
}

/** Stops the proxy, dropping open connections. */
export async function stopForwardProxy (proxy: ForwardProxy | undefined): Promise<void> {
  if (proxy === undefined) return
  proxy.server.closeAllConnections()
  await new Promise<void>((resolve, reject) => { proxy.server.close(error => (error === undefined ? resolve() : reject(error))) })
}
