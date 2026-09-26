# Access: proxies and where traffic goes

Some sites block the network a crawl runs from before any recipe logic matters. IMDb answered this
project's sandbox with an AWS WAF challenge, and Peugeot UK's Akamai edge answered "Access Denied", real
browser included. No selector fixes an IP-level block. The fix is to send the traffic from somewhere else,
through a proxy.

This page explains how OpenCraw does that: the recipe says what the site needs, a separate access config
says how to get it, and the engine applies the result to every browser page, bootstrap and HTTP request of
the run. When a response is a block anyway, the run can take a new lease and retry. A profile can also point at
a remote browser service instead of a proxy.

## Two files, two concerns

| Where | Holds | Shared? |
|---|---|---|
| The input recipe, `session.access` | What the **site** needs: which profile, which country, whether the IP must stay the same. | Yes. No secrets. |
| The access config, a runner-side JSON file | How **you** get it: providers, gateways, credentials (as `{{env.NAME}}`). | No. It points at your accounts. |

A recipe:

```json
"session": { "access": { "profile": "residential", "country": "gb" } }
```

An access config:

```json
{
  "$schema": "../packages/core/schemas/access-config.schema.json",
  "profiles": {
    "residential": { "kind": "proxy", "preset": "brightdata",
      "params": { "customer": "{{env.BRD_CUSTOMER}}", "zone": "residential", "password": "{{env.BRD_PASSWORD}}" } },
    "office": { "kind": "proxy", "server": "http://proxy.internal:3128", "username": "crawler", "password": "{{env.OFFICE_PROXY_PASSWORD}}" }
  },
  "default": "office"
}
```

`default` is used by every recipe that names no profile. Without an access config, or without a default,
recipes go direct.

Run it:

```sh
BRD_CUSTOMER=hl_123 BRD_PASSWORD=... opencraw run recipes/ --access access.json
opencraw run recipes/ --access access.json --access-profile residential   # override the default
OPENCRAW_ACCESS=access.json opencraw probe https://example.com           # the env var works too
```

From code: `createCrawler({ access: await loadAccessConfig('access.json') })`. From the MCP server: start it
with `OPENCRAW_ACCESS=/path/to/access.json` in its environment. The `run` and `probe` tools then take an
`access` argument naming a profile; the file never passes through the tool call.

## Why a config and not a plugin per provider

Before designing this, we surveyed 10 proxy networks, 8 "unblocker" products, 6 scraping APIs and 9
remote-browser services. Each one connects in one of three ways:

| Shape | Who | How OpenCraw handles it |
|---|---|---|
| HTTP proxy, `{ server, username, password }` | All 10 proxy networks (Bright Data, Oxylabs, Decodo, IPRoyal, Webshare, SOAX, NetNut, Rayobyte, Evomi, Massive) and every unblocker's proxy mode (Bright Data Web Unlocker, Oxylabs Web Unblocker, Zyte, ScraperAPI, ScrapingBee, Scrapfly, Decodo, ZenRows) | `proxy` profiles, with presets |
| Remote browser over CDP | Bright Data Browser API, Browserless, Browserbase, Zyte, Oxylabs, Steel, Hyperbrowser | `cdp` profiles; a plugin when the URL comes from an API call |
| URL-rewriting API (`GET api.x.com?url=`) | ScraperAPI, ScrapingBee, Zyte, Scrapfly, ZenRows | Not supported: no live page, a different request and response shape per vendor, and every one of these vendors also sells the proxy shape |

The proxy shape covers almost everyone. The providers differ only in where they want options written:

- in the **username** (Bright Data `-country-us-session-abc`, Oxylabs `-cc-US-sessid-abc`);
- in the **password** (IPRoyal `_country-us_session-abcd1234`);
- in **headers** (Zyte `Zyte-Geolocation`, Oxylabs `x-oxylabs-geo-location`).

Those differences are data, not code, so a provider is a **preset**: a few templates. A plugin is only needed
where connecting takes code (see [Plugins](#plugins)).

## Profiles

Every string in a profile is a template. It can read:

| Path | Value |
|---|---|
| `{{env.NAME}}` | The process environment. A variable that is not set fails the recipe with its name, so an empty password never reaches the provider. |
| `{{params.x}}` | The profile's own `params`, which may themselves read `env`. |
| `{{session}}` | A new random session id per lease, in the profile's `session.idFormat`. Absent when the lease is not sticky. |
| `{{country}}` | The recipe's `session.access.country`. Absent when the recipe names none. |
| `{{recipe.id}}` | The input recipe's id. |

Templates use the full expression syntax (authoring §3.4), so optional parts are one ternary:
`"user-{{params.user}}{{country ? '-country-' + lower(country) : ''}}"`.

### `proxy`

| Field | Meaning |
|---|---|
| `preset` | A built-in preset (below) that fills `server`, `username`, `password`, `headers` and defaults. Explicit fields override it. |
| `params` | Values the preset's templates read as `params.*`. |
| `server` | `http://host:port`. `https://` proxies work too. SOCKS only without credentials: Chromium never sends SOCKS credentials (microsoft/playwright#10567), so an authenticated SOCKS profile is refused when loaded. |
| `username`, `password` | Templates. |
| `bypass` | Comma-separated hosts that skip the proxy. |
| `headers` | Sent with every request. Templates; a header that renders empty is dropped. |
| `ignoreHTTPSErrors` | Needed for providers that intercept HTTPS: every unblocker, and Bright Data residential and mobile zones. |
| `session.idFormat` | `alnum10` (default), or `alnum`, `digits` or `hex` followed by a length. IPRoyal wants exactly 8 characters, Webshare and ScrapingBee want digits. |
| `session.rotate` | `per-recipe` (default): one session, so one IP, for the whole recipe run. `per-request`: no session id, and the provider rotates the IP on every request. A recipe's `session.access.sticky` overrides it. |
| `blockResources` | Resource types pages never load, such as `image`, `font`, `media`, `stylesheet`. Residential and mobile proxies bill per GB, and a crawl rarely needs images. Web mode only. |

### `pool`

A list of proxies, for providers that sell IP lists (Webshare direct, dedicated datacenter IPs) or your own.

```json
{ "kind": "pool", "rotate": "round-robin", "proxies": [
  { "server": "http://203.0.113.10:8080", "username": "u", "password": "{{env.POOL_PASSWORD}}" },
  { "server": "http://203.0.113.11:8080", "username": "u", "password": "{{env.POOL_PASSWORD}}" }
]}
```

Each lease takes the next entry, or a random one with `"rotate": "random"`. `headers`, `ignoreHTTPSErrors`
and `blockResources` apply to every entry.

### `cdp`: a remote browser

Remote-browser services run the browser for you and deal with IPs, fingerprints and challenges. A web recipe
connects to one over the Chrome DevTools Protocol instead of launching Chromium:

```json
"cloud": { "kind": "cdp",
  "endpoint": "wss://brd-customer-{{env.BRD_CUSTOMER}}-zone-{{env.BRD_ZONE}}{{country ? '-country-' + lower(country) : ''}}:{{env.BRD_PASSWORD}}@brd.superproxy.io:9222" }
```

| Field | Meaning |
|---|---|
| `endpoint` | `wss://…` or `http://host:port`. A template: tokens and credentials usually live in it. |
| `headers` | Sent with the connection, for providers that authenticate with a header. Templates. |
| `params` | Read as `params.*`, as in `proxy` profiles. |
| `session.idFormat` | The format of `{{session}}`, for providers that name sessions in the URL. |
| `blockResources` | As in `proxy` profiles. |

Endpoints of common services, to adapt from the provider's current docs:

| Service | `endpoint` |
|---|---|
| Bright Data Browser API | `wss://brd-customer-…-zone-…[-country-xx]:PASSWORD@brd.superproxy.io:9222` |
| Browserless | `wss://production-sfo.browserless.io?token=…[&proxy=residential&proxyCountry=xx]` |
| Oxylabs Headless Browser | `wss://USER:PASS@hb.oxylabs.io?p_cc=XX` |
| Zyte | `https://browser.zyte.com/?ttl=600[&proxy_region=XX]`, with `headers: { "Authorization": "Basic {{env.ZYTE_BASIC}}" }` (the key followed by `:`, base64-encoded) |

How a remote session is used:

- **Web recipes only.** An api recipe on a `cdp` profile fails at the start of its run, before any request,
  with a message saying it needs a proxy profile. `probe` refuses one too.
- **The bootstrap runs in the same remote session as the crawl.** Providers tie the IP and fingerprint to the
  connection, so a login in one connection would not carry over to another.
- **The provider's own context is reused** when it offers one, because some providers pin the proxy and
  fingerprint to it. Cookies (from `session.cookies` or a saved `storageStatePath`), headers, blocked resources
  and the viewport are applied to it. `session.userAgent` cannot change on an existing context and is ignored.
  From a saved state only cookies apply, not localStorage.
- **Closing disconnects**, which ends the session on the provider's side (and its billing).
- **Rotation reconnects.** With `onBlock.rotate`, a block opens a new connection, and so a new remote session.
  Some providers allow one domain per session and short idle timeouts, so rotation is the normal way to get a
  fresh one.

### `direct` and `plugin`

`{ "kind": "direct" }` names "no proxy" explicitly, for example as the default while some recipes ask for a
proxy. `{ "kind": "plugin", "name": "...", "options": { ... } }` hands the lease to a registered plugin.

## Presets

| Preset | Provider | `params` | Where options go | Notes |
|---|---|---|---|---|
| `brightdata` | Bright Data proxy zones: residential, datacenter, ISP, mobile, Web Unlocker | `customer`, `zone`, `password` | username | Port 44445: the certificates of the old ports 22225 and 33335 expired on 2026-09-25. Intercepts HTTPS, so `ignoreHTTPSErrors` is on. Bright Data advises against browsers behind Web Unlocker. |
| `oxylabs-residential` | Oxylabs residential | `user`, `password`, `sessionMinutes?` | username | Sticky session length defaults to 10 minutes. |
| `decodo` | Decodo (formerly Smartproxy) residential | `user`, `password`, `sessionMinutes?` | username | |
| `iproyal` | IPRoyal residential | `user`, `password`, `lifetime?` (such as `10m`) | password | Session ids are exactly 8 characters. |
| `webshare` | Webshare rotating backbone | `user`, `password` | username | Not sticky means `-rotate`. |
| `scrapingbee` | ScrapingBee in proxy mode | `apiKey`, `premium?` | password | `render_js=False` is always sent: the browser renders. Every sub-resource costs credits, so block resources. |
| `zyte` | Zyte API in proxy mode | `apiKey` | headers | Intercepts HTTPS. |

Adding a provider means adding an entry to `packages/core/src/access/access-preset.store.ts`: a server and
templates, no code. Any provider can also be written as a raw `proxy` profile without a preset.

## What the engine does with a lease

- **One lease per recipe run.** The bootstrap (a login, a consent wall) and the crawl that follows share it,
  so the cookies a login produced are used from the same IP. A new lease, with a new session id, is taken for
  each recipe run.
- **Both modes.** Web recipes get the proxy on their browser context. Api recipes get it on their HTTP
  request context, which tunnels even `http://` targets through `CONNECT`.
- **The trace shows it.** `access:lease` names the profile, the kind, the proxy server and the session id,
  never the credentials:

  ```text
  ▶ imdb (web)
    ⇄ access residential (proxy http://brd.superproxy.io:44445, session k3v9x0q2ma)
  ```

- **A recipe that asks for a country with no profile applying** runs direct and gets a `warning` event rather
  than silently ignoring it.
- **A block** (below) can make the run take a new lease mid-crawl.

## Blocks and rotation

Every navigation (web) and request (api) is checked against the recipe's block rule. A match fails the step
with a `BlockedError` naming the URL and the reason, and emits `access:blocked`. That replaces the old
symptom, a selector that finds nothing on a challenge page.

The default rule treats these as a block: status 403 or 429, or an `x-amzn-waf-action: challenge` header
(AWS WAF answers `202` with it, which is how IMDb refused this project's sandbox). A recipe can replace the
rule:

```json
"session": {
  "blockedWhen": { "status": [403, 503], "header": { "server": "AkamaiGHost" }, "text": "access denied|verify you are human" },
  "onBlock": { "rotate": true, "attempts": 2 }
}
```

`blockedWhen` has three optional conditions, and any one that matches is a block:

- `status`: a list of HTTP statuses.
- `header`: header names mapped to a pattern the value must match.
- `text`: a pattern the body must match.

Patterns are case-insensitive regular expressions. A rule you set replaces the default rule completely.

`onBlock.rotate` makes the run take a new lease, which means a new session id and so a new IP on rotating
providers. It then reopens the browser or HTTP context, runs the bootstrap again (so a login happens on the new
IP), and retries the blocked step. `attempts` caps the rotations per recipe run and defaults to 2. A rotation
does not use up the step's own `retry` attempts. Once the rotations are used up, the block fails the step like
any other error, so `onError: skip` or `retry` still apply.

Under concurrency, several iterations blocked on the same lease trigger one rotation, not one each. The old
contexts stay open until the run ends, so requests still in flight on them finish.

The trace shows the route:

```text
  ⇄ access residential (proxy http://brd.superproxy.io:44445, session k3v9x0q2ma)
  ⇢ page 1  https://www.imdb.com/chart/top/  [403]
  ⛔ blocked https://www.imdb.com/chart/top/: HTTP 403
  ↻ new access lease (attempt 2)
  ⇄ access residential (proxy http://brd.superproxy.io:44445, session 0p2wq7x1ze)
  ⇢ page 1  https://www.imdb.com/chart/top/
```

Rotation only helps when the new lease reaches the site from somewhere else: a proxy profile with sticky
sessions, a pool, or a plugin. On a `direct` profile it reopens the session from the same IP.

## Plugins

A plugin is for access that config cannot express: a remote browser whose URL comes from a REST call
(Browserbase, Steel, Hyperbrowser), a proxy list fetched from an API, a credential that expires. It is a name and
one function:

```ts
import { createCrawler } from '@opencraw/core'
import type { AccessPlugin } from '@opencraw/core'

const rotatingList: AccessPlugin = {
  name: 'my-list',
  async lease ({ options, attempt }) {
    const response = await fetch(String(options.listUrl))
    const proxies = (await response.json()) as { server: string }[]

    return { proxy: proxies[attempt % proxies.length] }
  },
}

const crawler = createCrawler({ accessPlugins: [rotatingList], access: {
  profiles: { list: { kind: 'plugin', name: 'my-list', options: { listUrl: 'https://api.example/proxies?key={{env.LIST_KEY}}' } } },
  default: 'list',
} })
```

The plugin receives its profile's `options` with every string rendered, plus the recipe id, the requested
country, stickiness and the attempt number. It returns a lease: `proxy` or `cdp`, `headers`,
`ignoreHTTPSErrors`, `blockResources`, `session`, and an optional `release()` called when the run ends.

A remote browser created through an API is the same shape, returning `cdp`. This sketch follows Browserbase's
REST API; check the provider's current docs for the exact endpoints and fields:

```ts
const browserbase: AccessPlugin = {
  name: 'browserbase',
  async lease ({ options }) {
    const headers = { 'X-BB-API-Key': String(options.apiKey), 'Content-Type': 'application/json' }
    const created = await fetch('https://api.browserbase.com/v1/sessions', { method: 'POST', headers, body: JSON.stringify({ projectId: options.projectId, proxies: true }) })
    const session = (await created.json()) as { id: string, connectUrl: string }

    return {
      cdp:     { endpoint: session.connectUrl },
      session: session.id,
      release: async () => {
        await fetch(`https://api.browserbase.com/v1/sessions/${session.id}`, { method: 'POST', headers, body: JSON.stringify({ projectId: options.projectId, status: 'REQUEST_RELEASE' }) })
      },
    }
  },
}
```

`release()` runs when the recipe run ends, including after a rotation, so a remote session is never left
running.

**From the cli and the MCP server**, plugins come from a plugins module: the same file that gives the recipes'
hooks, with named exports.

```js
// plugins.mjs
export const hooks = { positive: input => Number(input) > 0 }
export const accessPlugins = [rotatingList, browserbase]
```

```sh
opencraw run recipes/ --plugins plugins.mjs --access access.json   # or OPENCRAW_PLUGINS=plugins.mjs
```

`probe` takes `--plugins` too, so it can lease from a plugin profile. The MCP server reads `OPENCRAW_PLUGINS`
(or `OPENCRAW_HOOKS`) from its own environment, never from a tool call. A profile naming a plugin the module
does not provide fails before the crawl starts.

## Throttling per site

`limits.delayMs` and `limits.concurrency` belong to one recipe. Two recipes that crawl the same site each
keep their own pace, so together they hit it twice as hard. The access config's `throttle` is the crawler's
politeness towards each **site**, across every recipe and run it executes:

```json
{
  "profiles": {},
  "throttle": {
    "delayMs": 500,
    "concurrency": 2,
    "domains": {
      "example.com":     { "delayMs": 2000, "concurrency": 1 },
      "api.example.com": { "delayMs": 0 }
    }
  }
}
```

- `delayMs`: at least this long between two request starts to one site. `concurrency`: at most this many of
  its requests in flight. At the top level they apply to every site; under `domains`, to that domain and its
  subdomains (`example.com` covers `www.example.com`), the longest match winning.
- A site is its host name unless a `domains` entry groups it: `www.example.com` and `shop.example.com` share
  one lane under the `example.com` rule above, and have one each without it.
- It counts every navigation, request, bootstrap page and `next.selector` click the engine starts. Requests
  a page makes by itself (its images, its scripts, its XHRs) are not counted.
- A recipe's own `limits` still apply on top: the stricter of the two wins.

Like a single-lane bridge with a traffic light: however many recipes arrive, each car waits for the one ahead
to be far enough across.

From the command line, `--host-delay <ms>` and `--host-concurrency <n>` set the top-level defaults (over the
file's). From code: `createCrawler({ throttle: { delayMs: 500, domains: { … } } })`.

## Not covered yet

Tracked on issue #8:

- **Persistent browser profiles.**

A custom CA certificate is not a profile option either. Chromium reads its own certificate store, so use
`ignoreHTTPSErrors`, or set `NODE_EXTRA_CA_CERTS` for the HTTP side when a provider gives you a CA.
