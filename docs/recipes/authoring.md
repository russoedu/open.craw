# Authoring a recipe: the reference

A crawl is described by JSON files, never code. **One output recipe** declares the records you want.
**One or more input recipes** declare how to get them from a site. The engine runs the inputs one after
another and writes records that all match the output. Anything the JSON cannot express goes into a
**hook**, a named function you register in code.

The mental model: every step fills one named cell (its `id`), later steps read earlier cells by name, and the
mapping at the end says which cells become which output fields. Navigation is the order of `goto` /
`request` steps; the link between two pages is an id rendered into the next URL.

Point `$schema` at `packages/core/schemas/output-recipe.schema.json` or `input-recipe.schema.json` and the
editor validates and completes as you type. Every recipe is validated on load; unknown keys are errors, so a
typo never silently does nothing.

---

## 1. The output recipe

```json
{
  "$schema": "../../packages/core/schemas/output-recipe.schema.json",
  "kind": "output",
  "id": "filmography",
  "version": 1,
  "description": "One film per record from the lead actor's filmography.",
  "onMissing": "null",
  "fields": {
    "actor":      { "type": "string", "required": true, "key": true },
    "title":      { "type": "string", "required": true, "key": true },
    "year":       { "type": "integer", "nullable": true, "min": 1880, "max": 2100 },
    "role":       { "type": "string", "nullable": true },
    "filmUrl":    { "type": "url", "required": true },
    "source":     { "type": "string", "generated": "recipeId", "key": true },
    "scrapedAt":  { "type": "datetime", "generated": "now" }
  }
}
```

| Key | Meaning |
|---|---|
| `id` | Lowercase letters, digits, hyphens. Input recipes name it in their `output`. |
| `version` | A positive integer you bump when the shape changes. |
| `fields` | Name → field spec. Names have no dots; nesting is expressed with `type: "object"`. |
| `onMissing` | Recipe-wide default for a missing value: `fail`, `skip-record` or `null`. See §7. |

### 1.1 Field spec

| Key | Meaning |
|---|---|
| `type` | `string`, `number`, `integer`, `boolean`, `date`, `datetime`, `currency`, `url`, `enum`, `array`, `object`, `json`. |
| `required` | Missing value fails the recipe (unless a policy says otherwise). Default `false`. |
| `nullable` | A missing value becomes `null` instead of failing. |
| `default` | Used when the value is missing and the resolved policy is `default` (it is, automatically, when a default exists and nothing else is said). |
| `onMissing` | Per-field policy: `fail`, `skip-record`, `null`, `default`. |
| `key` | Part of the record identity. All `key` fields together form the key; repeated keys are dropped as duplicates. |
| `generated` | `now` (ISO instant), `uuid`, `sourceUrl` (the page the record was emitted from), `recipeId`. Engine-supplied; mapping it is a binding error. |
| `format` | Input format for `date` / `datetime` (tokens `YYYY MM DD HH mm ss`); output is always ISO 8601. |
| `currency` | ISO 4217 code for `currency` fields. Fills in when the value carries none. |
| `values` | Allowed values for `enum`. |
| `items` | Element spec for `array`. |
| `fields` | Member specs for `object`. A `json` field takes none. |
| `min`, `max` | Numeric bounds. |
| `minLength`, `maxLength` | String length or array length bounds. |
| `pattern` | A regular expression the string must match. |

### 1.2 What each type accepts (coercion)

After the transform chain, the value is converted to the field's type. Conversion is forgiving where a site's
text is predictable, strict where a wrong value would poison the data.

| Type | Accepts | Produces |
|---|---|---|
| `string` | text, numbers, booleans | text. A list is an error: extract one value or `join` it. |
| `number` | text with a number in it (`"1.299,00 €"`, `"$1,299"`), numbers | a number. Without a `locale` transform the decimal separator is guessed: the last separator followed by 1 or 2 digits. |
| `integer` | as `number` | truncated. |
| `boolean` | booleans, numbers, text | `true` for `yes`, `true`, `1`, `on`, `in stock`, `available` (substring, case-insensitive); use the `boolean` transform with `truthy` for other phrases. |
| `date` | ISO text, `Date.parse`-able text, epoch ms, or text matching `format` | `YYYY-MM-DD` (UTC). |
| `datetime` | same | ISO 8601 instant. |
| `currency` | text with amount and symbol or code, a number, or `{ amount, currency }` | `{ "amount": 1299, "currency": "EUR" }`. Needs a code from the text, the transform or the field, else an error. |
| `url` | an absolute URL string | normalised. A relative link is an error: use the `absoluteUrl` transform first. |
| `enum` | text among `values` | the text. |
| `array` | a list, or a single value (wrapped) | a list; each item coerced by `items`. |
| `object` | an object | only the declared `fields`, each coerced. **Undeclared keys are dropped.** |
| `json` | any JSON value: an object of any shape, a list, text, a number, a boolean | the value, **verbatim**: every key kept, however nested, nothing coerced. Only what JSON cannot hold (`NaN`, `Infinity`, a `Date`, a function) is an error. |

`object` is for a shape you know: it validates it and keeps nothing else. `json` is for a payload whose
shape you don't know or don't want to fix: archival, a schema that evolves, "land it now, parse it later".
It still takes `required`, `nullable`, `onMissing`, `default` and `key` like any other field, and it takes
no `fields` or `items`. Landing a whole API response as one field:

```json
{ "kind": "output", "id": "configuration-raw", "version": 1, "fields": {
  "configurationId": { "type": "string", "key": true, "required": true },
  "fetchedFrom":     { "type": "url", "generated": "sourceUrl" },
  "payload":         { "type": "json", "required": true }
}}
```

```json
"steps": [
  { "type": "request", "id": "configuration", "url": "{{start.url}}", "as": "json" },
  { "type": "emit" }
],
"mapping": {
  "configurationId": { "from": "configuration.id" },
  "payload":         { "from": "configuration" }
}
```

### 1.3 Keys and duplicates

The key is the JSON of the key fields' values in declaration order. De-duplication scope is a run option:
`run` (default: across every input recipe, first record wins), `recipe`, or `off`. A record without key
fields is never de-duplicated. Duplicates are reported (`record:duplicate`) and counted, not written.

---

## 2. The input recipe

```json
{
  "$schema": "../../packages/core/schemas/input-recipe.schema.json",
  "kind": "input",
  "id": "tmdb",
  "output": "filmography",
  "mode": "api",
  "description": "why this route works on this site",
  "start": [{ "url": "https://www.themoviedb.org/movie/949-heat" }],
  "vars": { "lang": "en" },
  "session": { "userAgent": "...", "headers": { "accept-language": "en-US,en;q=0.9" } },
  "limits": { "maxRecords": 10, "delayMs": 1000, "timeoutMs": 30000 },
  "onError": { "policy": "fail" },
  "steps": [ ... ],
  "mapping": { ... }
}
```

| Key | Meaning |
|---|---|
| `id` | Lowercase letters, digits, hyphens; unique in a run. Also the value of `generated: "recipeId"`. |
| `output` | The output recipe id this recipe feeds. Loading fails if it does not match. |
| `mode` | `web`: a real browser page (Playwright). `api`: HTTP requests through Playwright's request context, no browser. See §2.1. |
| `start` | One or more start points `{ url, vars? }`. Each runs the whole step list from a fresh scope with `start.url` and its `vars`. |
| `vars` | Values templates read as `{{vars.name}}`. Start-point `vars` override recipe `vars`. |
| `session` | §2.2. |
| `limits` | `maxRecords` stops the walk after that many records, exactly, whatever runs in parallel. `delayMs` is the minimum interval between two request starts across the recipe. `timeoutMs` bounds navigations and requests. `concurrency` (default `1`) is how many `forEach` iterations may run at once in `api` mode (§3.9). `retry` sends a request that fails in passing again (§7; on by default). |
| `onError` | The default policy for every step. §7. |
| `steps` | The acquisition recipe. §3. |
| `mapping` | Output field → mapping rule. §5. |
| `description` | Free text. Write down *why the route works*: which page is public, which element is the lead actor, which table is the acting one. Future you will thank you when the site changes. |

### 2.1 Choosing the mode

Try `api` first. It is faster, needs no browser, and most sites still serve their data in the HTML
(server-rendered markup, `<script type="application/ld+json">`, inline JSON). Use `web` when the content is
built by JavaScript after load, when you must click or scroll to reveal it, or when the site challenges plain
HTTP clients (bot walls). A recipe cannot mix modes in its steps, but an `api` recipe can run **browser
steps in its bootstrap** to obtain a session (§2.2).

### 2.2 Session

| Key | Meaning |
|---|---|
| `headers` | Extra HTTP headers, both modes. |
| `userAgent` | Sent as the user agent, both modes. Sites answer a Chrome UA more readily than a bare one. |
| `cookies` | Cookies to start with (Playwright's shape: `name`, `value`, `domain`, `path?`, ...). |
| `viewport` | `{ width, height }`, web mode. |
| `storageStatePath` | A file saved by a previous bootstrap (`saveTo`); the recipe starts from it and skips the bootstrap. |
| `bootstrap` | `{ steps, keep, saveTo? }`. Runs `steps` in a browser **before** the crawl, then captures what `keep` lists (`cookies`, `localStorage`). A `web` recipe starts its page from that state; an `api` recipe sends those cookies with every request. Bootstrap steps are web steps only and never emit. |
| `access` | `{ profile?, country?, sticky? }`: what the site needs from the network. `profile` names a profile of the runner's access config (its default when omitted), `country` is a two-letter code for profiles that target by country, `sticky: false` lets the provider change IP per request. Never credentials: those live in the access config. See [access.md](./access.md). |
| `blockedWhen` | `{ status?, header?, text? }`: what counts as the site refusing the crawl, checked on every navigation and request. Default: 403, 429, or an AWS WAF challenge header. A block fails the step with the URL and reason instead of a later selector miss. |
| `onBlock` | `{ rotate?, solve?, attempts? }`. `rotate: true`: on a block, take a new access lease (a new IP), reopen the session (re-running the bootstrap) and retry the step, up to `attempts` times per run (default 2). `solve: true` (web mode, needs `captcha`): a block page showing a captcha is solved on the spot; rotation, if on, applies only when solving fails. |
| `browserProfile` | A persistent browser profile of the runner (cookies, storage, cache kept between runs): web recipes and bootstraps run in it, api recipes start from its cookies. See [access.md](access.md#persistent-browser-profiles). |
| `captcha` | `{ solver, detect?, verify?, attempts?, timeoutMs?, maxSolves? }`, web mode and bootstraps: after every navigation, click and key press, a visible challenge is solved by the named solver before the next step runs. §6.1. |

A login looks like this and works for both modes:

```json
"session": { "bootstrap": { "keep": ["cookies"], "saveTo": "state/shop.json", "steps": [
  { "type": "goto", "url": "https://shop.example/login" },
  { "type": "fill", "selector": "#user", "value": "{{vars.user}}" },
  { "type": "fill", "selector": "#pass", "value": "{{vars.pass}}" },
  { "type": "click", "selector": "button[type=submit]" },
  { "type": "wait", "selector": "#logged-in" }
]}}
```

---

## 3. Steps

Every step has `type`, and may have:

| Key | Meaning |
|---|---|
| `id` | The name of the value the step produces. A word: letters, digits, underscores. Unique along any path. |
| `onError` | `{ "policy": "fail" }`, `{ "policy": "skip" }` or `{ "policy": "retry", "attempts": 3, "backoffMs": 500 }`. §7. |
| `when` | A template; the step runs only when it renders truthy (§3.4). |

### 3.1 Web steps (browser page)

| Step | Fields | Notes |
|---|---|---|
| `goto` | `url` (template), `waitUntil?` (`load`, `domcontentloaded`, `networkidle`, `commit`) | Relative URLs resolve against the current page. Records `page.url`. |
| `click` | `selector` or `target`, `optional?` | First match. With `optional: true` a missing element is skipped after a 2 s wait. |
| `fill` | `selector` or `target`, `value` (template) | |
| `press` | `key`, `selector?` or `target?` | A key on an element, or on the page. |
| `select` | `selector` or `target`, one of `value`, `label`, `index` | Picks an option of a `<select>`; `value` and `label` are templates. Fires the page's `change` handlers. |
| `scroll` | `to` (`bottom` or a selector), `times?`, `untilStable?` | `untilStable` keeps scrolling until the page stops growing: infinite lists. |
| `wait` | one of `selector`, `ms`, `state: "networkidle"` | `selector` waits for visibility. Put a `wait` after `goto` on script-heavy pages before extracting. |
| `evaluate` | `script` | JavaScript evaluated in the page; the result is bound under `id`. **Trusted recipes only.** |
| `screenshot` | `path` (template) | Full page. A debugging aid. |
| `captcha` | `solver?`, `selector?`, `verify?`, `attempts?`, `timeoutMs?` | Solves the challenge on the page, if there is one (none is fine), reCAPTCHA v3 included. Missing fields come from `session.captcha`. §6.1. |

Clicks and key presses can navigate; the engine re-reads the page URL after every web step.

`target` is a template instead of a selector: it renders either to a **live element** (the variable of a
`forEach` over `selector`, §3.7) or to a selector string. Give one of `selector` and `target`, never both.

### 3.2 Api steps (HTTP)

| Step | Fields | Notes |
|---|---|---|
| `request` | `url` (template), `method?`, `query?`, `headers?`, `body?`, `as?` (`json`, `jsonl`, `html`, `text`, `pdf`, `csv`, `xlsx`, `pptx`, `yaml`, `markdown`, `xml`), `encoding?`, `delimiter?`, `scalars?` | The response becomes the current document and, if `id` is set, the id holds the parsed JSON, the read PDF, workbook or deck, the markup or the text. Relative URLs resolve against the current page. Without `as`, the content type decides (`application/pdf` is a PDF, `text/csv` a CSV, a spreadsheet type a workbook, a presentation type a deck, `application/yaml` YAML, `application/x-ndjson` JSON Lines, `text/markdown` Markdown, an XML type XML: §4.12). A `file:` URL reads a local file, its kind from `as` or the extension (`.csv`, `.tsv`, `.xlsx`, `.xlsm`, `.pptx`, `.yaml`, `.yml`, `.jsonl`, `.ndjson`, `.md`, `.xml`, `.rss`, `.atom`, `.xml.gz`). 4xx/5xx fail the step. |

Text bodies are decoded from, in order: a byte-order mark, `encoding` (any WHATWG label: `windows-1252`,
`iso-8859-15`, `shift_jis`), the charset the server declares, UTF-8, and Windows-1252 for text that is not
UTF-8 (the usual European export). `delimiter` (one character) overrides a CSV's detected delimiter (§4.7).

`body` is templated **all the way down**: a string body is one template, and in an object or list body
every string inside it is one, at any depth. A string that is exactly one placeholder keeps the value's type
(`"limit": "{{vars.limit}}"` sends a number). Numbers, booleans and `null` go as they are. An object or list
body is sent as JSON:

```json
{ "type": "request", "id": "token", "url": "https://auth.example/oauth2/token", "method": "POST", "as": "json",
  "body": { "grant_type": "client_credentials", "client_id": "{{vars.clientId}}", "client_secret": "{{vars.clientSecret}}" } }
```

### 3.3 Steps of both modes

| Step | Fields | Notes |
|---|---|---|
| `extract` | `selector`, `kind` (`css`, `xpath`, `jsonpath`, `regex`, `table`), `take?`, `many?`, `from?`; `namespaces?`, `ignoreNamespaces?` (`xpath` on XML) | §4. |
| `set` | `value` | A literal, or a template when it is a string. |
| `collect` | `into` (an id), `value` | Appends `value` (a literal, or a template when it is a string) to the list `into` holds, in whichever enclosing scope binds it; a list value is appended item by item, a missing one adds nothing. `into` must be bound first, usually `{ "type": "set", "id": "all", "value": [] }` before the loop: the binding validator checks. The way to carry values out of `forEach` iterations or `paginate` pages (§3.6). |
| `forEach` | `over` (a list id) **or** `selector` (web), `as` (variable), `steps`, `emit?` | Runs `steps` once per item in a fresh child scope with the item bound as `as`. `emit: true` produces one record per iteration. `over` may name a single value; it is treated as a one-item list. `selector` iterates the live elements it matches (§3.7). |
| `if` | `test` (template), `steps`, `else?` | Runs `steps` when `test` renders truthy, otherwise `else`, **in the current scope**: ids bound in a branch are visible after it. §3.8. |
| `paginate` | `next`, `until?` (template), `maxPages?`, `steps` | Runs `steps` per page in a fresh child scope, then follows `next`. §3.6. |
| `emit` | – | Produces a record from everything in scope. |
| `hook` | `name`, `args?` | Calls the registered hook; `args` strings are templates. The result is bound under `id`. |

### 3.4 Templates

`{{path}}` reads: any id in scope, the current `forEach` variable and paths into it (`{{item.url}}`),
`{{vars.name}}`, `{{start.url}}`, `{{page.url}}`, `{{page.number}}`. Dotted paths walk into objects and
lists (`{{item.images[0]}}`). A template that is **exactly one placeholder** yields the value with its type
(a list stays a list); inside longer text values are stringified, missing ones as empty text.

A placeholder may also be an **expression** over such paths:

| Kind | Syntax |
|---|---|
| literals | `12`, `1.5`, `'text'`, `"text"`, `true`, `false`, `null` |
| arithmetic | `+ - * / %`, parentheses. `+` adds two numbers and concatenates anything else (`'p-' + id`). Division by zero and arithmetic on non-numbers give a missing value. Numeric text counts as a number (`qty * price` with `qty` = `"3"`). |
| comparison | `== != < <= > >=`. `==` is loose (`3 == '3'`, `null == missing`); ordering is numeric when both sides are numbers, else textual. |
| logic | `&& || !` with recipe truthiness (below); `a ?? b` gives `b` only when `a` is missing (`null` / undefined) |
| choice | `test ? a : b` |
| functions | `upper(s)`, `lower(s)`, `trim(s)`, `len(list or text)`, `default(v, fallback)` (missing or blank), `round(n, digits?)`, `number(text)`, `join(list, sep?)`, `first(list)`, `last(list)`, `replace(s, pattern, replacement)` (a regular expression, global), `contains(list or text, needle)`, `split(text, sep?)`, `urlEncode(s)` (percent-encodes one URL component: `{{start.url}}/config/{{urlEncode(id)}}` turns `#` into `%23`, a space into `%20`) |

```json
{ "type": "set", "id": "next_url", "value": "{{ start.url }}?page={{ page.number + 1 }}" },
{ "type": "set", "id": "label", "value": "{{ stock > 0 ? 'in stock' : 'sold out' }}" },
{ "type": "if", "test": "{{ len(links) > 0 && !wall }}", "steps": [] }
```

Rules that keep this safe and predictable:

- A placeholder made only of path characters (`item.display-name`, `ld.@type`, `price-1`) is a **path**,
  never an expression: write `{{ price - 1 }}` with spaces for subtraction.
- Expressions never run code. There is no member call, no `new`, no assignment; a value that is a function
  (a hook could bind one) reads as missing, and paths read own data only, so `constructor`, `__proto__`,
  `toString` and the like are missing too. Unknown functions and stray characters fail at parse time with
  the position.
- Deep nesting and very long expressions are refused (64 levels, 512 tokens).

Truthiness for `when`, `until`, `test` and the logical operators: `false`, `0`, `""`, `"false"`, `"0"`,
`"null"`, `null`, `undefined` and an empty list are false; everything else is true.

### 3.5 Scope: what a step can see

- Ids are bound in the scope where the step ran. Reads fall through to parent scopes.
- `forEach` opens a **fresh child scope per iteration**; `paginate` opens one **per page**. A child scope is
  dropped when its iteration or page ends, so nothing from page 1 is visible on page 2 and a row without a
  value cannot inherit the previous row's.
- `emit` snapshots the whole chain, child values shadowing parents. That is why a record produced inside a
  `forEach` sees its own row's values *and* the actor name extracted outside the loop.
- `page.url` / `page.number` and the current document are scope state, bound in the innermost scope that
  navigated. In `web` mode `page.url` is the real page URL; in `api` mode it is the final URL of the nearest
  `request`, and `start.url` before any request.
- A value found inside a child scope dies with it, unless a `collect` step appends it to a list bound in an
  enclosing scope (§3.6).
- Exactly **one emitting construct per path**: an emitting `forEach` may not contain an `emit` or another
  emitting `forEach`. The binding validator rejects it.
- `limits.maxRecords` stops the walk cleanly, wherever it is in the tree.

### 3.6 Pagination

`next` is evaluated **after** the page body ran:

| `next` | Mode | Behaviour |
|---|---|---|
| `{ "selector": "a.next" }` | web | Clicks it. If the body navigated away (a `forEach` visiting every item), the engine returns to the listing page first. No visible element within 2 s means no next page. |
| `{ "url": "{{start.url}}?page={{page.number}}" }` | both | The rendered value is the next `page.url` (web mode navigates to it). Empty means no next page. |
| `{ "jsonpath": "$.nextPage" }` | api | Evaluated on the current document; the value is the next URL, relative allowed. `null`, `false` or empty means no next page. |
| `{ "jsonpath": "$.cursor", "as": "cursor" }` | api | The value is bound under `cursor` in the next page's scope and the body builds the URL itself (`?cursor={{cursor}}`); on page 1 it is unset. |

Pagination also stops when `until` renders truthy or at `maxPages`. `page.number` increments per page.

Two shapes cover most sites:

```json
{ "type": "paginate", "next": { "jsonpath": "$.nextPage" }, "steps": [
  { "type": "request", "id": "list", "url": "{{page.url}}", "as": "json" },
  { "type": "extract", "id": "items", "from": "list", "selector": "$.items[*]", "kind": "jsonpath", "take": "json", "many": true },
  { "type": "forEach", "over": "items", "as": "item", "emit": true, "steps": [] }
]}
```

```json
{ "type": "goto", "url": "{{start.url}}" },
{ "type": "paginate", "next": { "selector": "a.next" }, "maxPages": 3, "steps": [
  { "type": "extract", "id": "links", "selector": "a.product", "kind": "css", "take": "attr:href", "many": true },
  { "type": "forEach", "over": "links", "as": "link", "emit": true, "steps": [
    { "type": "goto", "url": "{{link}}" },
    { "type": "extract", "id": "raw_title", "selector": "h1", "kind": "css" }
  ]}
]}
```

**Collect first, then fan out.** Some sources enumerate ids page by page and only then fetch one detail
per id. Page scopes are dropped, so the ids have to be carried out: bind an empty list before the
`paginate`, `collect` each page's ids into it, and loop over it once pagination has finished:

```json
{ "type": "set", "id": "allIds", "value": [] },
{ "type": "paginate", "next": { "jsonpath": "$.responseDetails.next", "as": "cursor" }, "until": "{{ !list.responseDetails.existsMore }}", "steps": [
  { "type": "request", "id": "list", "url": "{{start.url}}?cursor={{cursor}}", "as": "json" },
  { "type": "extract", "id": "ids", "from": "list", "selector": "$.items[*].id", "kind": "jsonpath", "take": "json", "many": true },
  { "type": "collect", "into": "allIds", "value": "{{ids}}" }
]},
{ "type": "forEach", "over": "allIds", "as": "id", "emit": true, "steps": [
  { "type": "request", "id": "detail", "url": "{{start.url}}/{{urlEncode(id)}}", "as": "json" }
]}
```

The list is held in memory until the loop ends: fine for thousands of ids. For millions, or when records
should start flowing before the enumeration ends, **fan out per page** instead: put the `forEach` inside
the `paginate` body, as in the first shape above, so each page's details are fetched and emitted before the
next page is read.

### 3.7 Live elements: driving a configurator

`forEach` with `selector` instead of `over` runs its body once per element the selector matches **on the
current page**, in web mode only. Each iteration binds a snapshot of the element under `as`:

| Path | Holds |
|---|---|
| `{{option.text}}` | text content, whitespace collapsed |
| `{{option.html}}` | inner HTML |
| `{{option.attrs.value}}`, `{{option.attrs.data-id}}` | any attribute |
| `{{option.value}}` | the `value` of an input, option or select |
| `{{option.selector}}`, `{{option.index}}` | where to find it again |

The snapshot is taken once, when the loop starts, and the engine never holds on to the element itself: a
`target: "{{option}}"` on `click`, `fill`, `press` or `select` re-resolves the element by selector and
index at that moment. That is what makes the loop survive a page that re-renders after every interaction,
which is what a car configurator, a size picker or a tabbed spec sheet does.

The shape for "one record per option of a `<select>`":

```json
{ "type": "goto", "url": "{{start.url}}" },
{ "type": "extract", "id": "model", "selector": "h1", "kind": "css" },
{ "type": "forEach", "selector": "select#trim option", "as": "option", "emit": true, "steps": [
  { "type": "select", "selector": "select#trim", "value": "{{option.attrs.value}}" },
  { "type": "extract", "id": "trim", "selector": ".trim", "kind": "css" },
  { "type": "extract", "id": "price", "selector": ".price", "kind": "css" }
]}
```

For a row of buttons or tabs use `{ "type": "click", "target": "{{option}}" }` instead of `select`. Put a
`wait` after the interaction when the page fetches the new state instead of rewriting it in place.

Limits: the loop iterates the matches present when it started; elements a later interaction adds are not
visited (nest a second `forEach` for that). Navigating away inside the body and relying on `target` on the
next iteration fails, because the selector no longer matches on the new page.

### 3.8 Decisions

`when` skips one step. `if` chooses between two step lists and is the tool for "do this only on the
first page", "the layout differs for sold-out items", "dismiss the wall if it is up":

```json
{ "type": "extract", "id": "wall", "selector": "#consent", "kind": "css", "take": "html", "many": true },
{ "type": "if", "test": "{{wall}}", "steps": [{ "type": "click", "selector": "#accept" }] }
```

`test` uses the same truthiness as `when` (§3.4); an extract with `many: true` never fails, so its empty
list is the clean way to test for presence. Both branches run in the scope of the `if`, not a child: a
value set in `steps` or `else` is visible to the steps after it, and each branch may bind the same id (they
never both run). A branch may `emit`; the one-emit-per-path rule treats the branches as separate paths.
The trace shows the branch taken as `⑂ steps.N  then`.

### 3.9 Concurrency

Two dials, one inside a recipe and one across recipes.

**Inside a recipe**, `limits.concurrency: 3` lets a `forEach` over a list run three iterations at once: a
listing whose body fetches every item's page fans out, and records come out in completion order rather than
list order.

- **api mode:** three requests in flight on one HTTP session.
- **web mode:** three **tabs** of the recipe's browser context, one per iteration: they share cookies (the
  login), each has its own page, and each closes when its iteration ends. A tab opens blank, so the body must
  start with a `goto` (`{{item.url}}`). A `forEach` over `selector` stays sequential: its live elements
  belong to one page.
- The limit is **per recipe run**, not per loop: nested loops share it. The outermost concurrent loop takes
  the permits; a loop inside one of its iterations runs its body sequentially, so nesting never multiplies
  the number of requests in flight.
- `delayMs` is a **rate**, not a per-request pause: the minimum time between two request starts across
  every iteration. `concurrency: 4, delayMs: 250` means at most four requests per second, in flight or not.
- `maxRecords` is exact: once reached, iterations still in flight finish but emit nothing more.
- Politeness towards a **site** across recipes is the runner's `throttle` ([access.md](access.md#throttling-per-site)),
  on top of these per-recipe limits.
- A failing step under the `fail` policy stops new iterations; the ones in flight settle, then the recipe
  fails as usual.
- A block under `onBlock.rotate` rotates once for the whole recipe; every tab reopens on the new lease.

**Across recipes**, `createCrawler({ parallel: 3 })` (CLI `--parallel 3`, MCP `run` with `parallel: 3`) runs
three input recipes of a set at once, each in its own browser context or HTTP session. They share the browser,
the sink and the per-site throttle. Reports keep the set's order. Under `onRecipeError: 'stop'`, a failure stops
the recipes not started yet. De-duplication under `dedupe: 'recipe'` stays per recipe; under `run`, the recipe
that emits a key first keeps it.

Parallel is only faster if the site lets it be. Pair it with the per-site `throttle`
([access.md](access.md#throttling-per-site)), which bounds what all of this adds up to on one site.

---

## 4. `extract` in depth

`extract` reads **a document** with **a selector** and **takes** something from each match.

### 4.1 Which document

| `from` | Web mode | Api mode |
|---|---|---|
| absent | the live page | the last `request`'s response (nearest scope that has one) |
| an id holding **text** | with `css`: the text as HTML (a fragment such as a `<tr>` is parsed as a fragment, so cells survive); with `jsonpath`: the text parsed as JSON | same |
| an id holding a **list of texts** | with `jsonpath`: every entry that parses as JSON becomes one element of an array and the path runs over the array | same |
| an id holding **data** (an object, a list of objects) | with `jsonpath` | same |
| an id holding a **read PDF** (a `request` with `as: "pdf"`) | with `table`, `regex` or `jsonpath` (§4.6) | same |
| an id holding a **read workbook** (a spreadsheet or a CSV) | with `table`, `regex` or `jsonpath` (§4.7) | same |
| an id holding a **read deck** (a presentation) | with `table`, `regex` or `jsonpath` (§4.8) | same |

**JSON Lines** (NDJSON: one JSON value per line, as bulk exports and Shopify bulk operations give) read with
`as: "jsonl"`, or by the `application/x-ndjson` / `application/jsonl` content types or the `.jsonl` / `.ndjson`
extensions, into an **array** of the lines' values: `$[*]` walks them. A line that does not parse fails the step
with its number. JSON Lines served as `application/json` fail with a hint to use `as: "jsonl"`.

**Wrapped JSON** is unwrapped, both in a response read as JSON and in text a `jsonpath` extract parses (`from`):

- comment guards around JSON-LD: `/* <![CDATA[ */ … /* ]]> */`, `<!-- … -->`;
- anti-hijacking prefixes: `)]}'` (with or without a comma), `while(1);`, `for(;;);`;
- JSONP: `callback({…});`, so an endpoint served as `text/javascript` reads with `as: "json"`;
- an assignment in an inline script: `window.__INITIAL_STATE__ = {…};` (with `var`, `let` or `const`, too).

Valid JSON is always read as it is: a wrapper is only removed when the text does not parse, and what is inside
must be strict JSON. Nothing is evaluated, so a JavaScript literal (`{ a: undefined }`, unquoted keys) still
fails: read it with `regex`, or a hook. The common JSON-LD pattern, both sites in the examples use it:

```json
{ "type": "extract", "id": "ld", "selector": "script[type=\"application/ld+json\"]", "kind": "css", "take": "text", "many": true },
{ "type": "extract", "id": "name", "from": "ld", "selector": "$[?(@['@type']=='Movie')].name", "kind": "jsonpath", "take": "json" },
{ "type": "extract", "id": "actors", "from": "ld", "selector": "$[*].actors[*].name", "kind": "jsonpath", "take": "json", "many": true }
```

### 4.2 Which selector

| `kind` | Works on | Notes |
|---|---|---|
| `css` | live page, fetched HTML, HTML fragments | Standard CSS through Playwright (live) or cheerio (static). |
| `xpath` | live page, fetched XML, fetched HTML, XML or HTML fragments | XPath 1.0. Fetched HTML is parsed the way a browser parses it (`<tbody>` added), so a query that works in the browser works on the fetched page. On namespaced XML, see §4.12. |
| `jsonpath` | JSON data, JSON text, lists of JSON texts | jsonpath-plus syntax: `$.items[*].url`, `$[?(@.actors)]`, `$[?(@['@type']=='Movie')].name`. |
| `regex` | any document as text: markup, text, JSON re-serialised, a list of texts joined by newlines | A JavaScript regular expression (flags `gs`); group 1 is taken when the pattern has one, else the whole match. For values that live in inline scripts (`"carPath":"([^"]+)"`), attributes, or table prose (`Boot capacity</td>\\s*<td>([^<]+)`). |

**Several keys into one list.** To merge same-shaped arrays kept under different keys
(`availableExteriors`, `availableInteriors`, `availableWheels`...), name them in an **unquoted** union, or
match the key names with a filter on `@property`:

```json
{ "type": "extract", "id": "options", "from": "config", "kind": "jsonpath", "take": "json", "many": true,
  "selector": "$.model[availableExteriors,availableInteriors,availableWheels,standardEquipments][*]" }
```

`$.model[?(@property.startsWith('available'))][*]` takes every key that starts with `available`, and
`$..[?(@property==='availableExteriors' || @property==='availableWheels')][*]` finds them at any depth. The
quoted union `$.model['availableExteriors','availableInteriors'][*]` matches **nothing** in jsonpath-plus:
leave the names unquoted.

Every selector is a template: `{{ }}` placeholders render against the scope first, so one step can pick the
colour set of the current trim (`$[?(@.trimname=='{{trim}}')].colors[*].displayName`) or the row of the
current item.

### 4.3 What to take

| `take` | From an element | From a JSON node |
|---|---|---|
| `text` (default) | text content with whitespace collapsed | scalars as text, objects as JSON text |
| `html` | inner HTML | – |
| `json` | outer HTML (the element itself, for a later `from`) | the node as data |
| `value` | an input's value | – |
| `attr:<name>` | the attribute, `undefined` when absent | – |

Take `html` (inner) when you will extract *inside* the element again; take `json` (outer) when the
information sits on the element's own attributes (`<li title="...">`).

### 4.4 One or many

`many: true` binds a list, empty when nothing matches. Without it the **first** match is bound, and **no match
fails the step**. That is deliberate: a missing element is either a site change (let it fail) or expected
(say so with `onError: { "policy": "skip" }`, and the id stays unset for the missing-value policy).

### 4.5 Nested markup: the shifted-field trap

A selector that matches an ancestor first returns the ancestor's whole inner HTML, which contains every
descendant. Extracting "the first title" from that wrapper gives the right title and "the first role" gives
the *next* row's role: a shifted field, no error. When a site nests tables or lists, select the innermost
repeating element (`table.credit_group tr`, not `tr`) and check the first record by hand.

---

### 4.6 PDFs

`request` with `as: "pdf"` (or a response served as `application/pdf`, or a local `file:…pdf`) reads the
PDF's text layer with pdf.js into pages of **rows**: text that sits side by side becomes a cell, cells whose
vertical extents overlap become a row. A scan has no text layer and fails the step (no OCR). Three extract
kinds read it:

| `kind` | Reads | Use for |
|---|---|---|
| `table` | tables, found by their header row | price lists, discount sheets, spec tables |
| `regex` | the text: one line per row, cells separated by a tab, pages by a blank line | a value next to a label: `Valid until\t(\S+)` |
| `jsonpath` | the structure: `{ kind: "pdf", pages: [{ number, width, height, rows: [{ text, top, bottom, cells: [{ x, y, width, height, text }] }] }] }` | positions, a given page |

A **table** extract takes the header row's pattern as its `selector`, and returns one table per match, `many`
for all of them:

```json
{ "type": "request", "id": "sheet", "url": "{{start.url}}", "as": "pdf" },
{ "type": "extract", "id": "tables", "selector": "^MODELLI", "kind": "table", "many": true,
  "until": "^(NOTA BENE|N\\.B\\.)",
  "columns": { "model": "^MODELLI", "discount": "^Sconto", "excluded": "^Versioni", "extra": "^Azion" } },
{ "type": "forEach", "over": "tables", "as": "table", "steps": [
  { "type": "set", "id": "rows", "value": "{{table.rows}}" },
  { "type": "forEach", "over": "rows", "as": "row", "emit": true, "steps": [] }
]}
```

Each table is `{ page, title, header, rows }`: `title` is the first header cell (`MODELLI FIAT`, a brand), and
each row an object keyed by `columns` (output key → a pattern for that column's header cell), or by the header
texts without `columns`. A cell's lines are joined by spaces. All patterns are case-insensitive.

| Field | Meaning |
|---|---|
| `selector` | Matches a table's header row, its cells joined by spaces. |
| `until` | Matches the row that ends a table: a footnote, a "Note:" line. A table also ends at the next row the `selector` matches, and at the page's end. With a narrow `selector` (one table among several), set `until` to the start of the next one. |
| `columns` | Output key → header pattern. Unmatched columns are dropped. |
| `align` | How a row's values sit against a cell wrapped over several lines: `top`, `center`, `bottom`, or `auto` (default). |

How it reads a table, which is what makes real-world sheets work:

- **Columns come from the body.** A header is often centred over a column whose cells are left-aligned, so the
  left edges of the body's cells cluster into bands, and bands map to header cells left to right. A header
  spanning two columns reads both.
- **Rows are regrouped.** A long name wraps over several lines, a note runs onto a second line, a list of
  versions sits above and below its row. A line with a name and a value, or with a value in the first value
  column, anchors a row; the other lines join it. With `auto`, a table that centres values beside wrapped
  names shares the wrapped lines evenly around each anchor; otherwise a line joins the nearest anchor, and a
  line halfway between two joins the one below.

Find the selectors with `opencraw probe <url or file.pdf>`: for a PDF it lists the rows and every row that
looks like a table header, with a ready `selector`. The Stellantis example
(`examples/stellantis-it-discounts/`) reads eight monthly discount sheets this way.

`fillDown` (below, §4.7) works on PDF tables too.

### 4.7 Spreadsheets and CSV

Both read into a **workbook**: sheets of cells that the same three extract kinds read.

**Spreadsheets.** `request` with `as: "xlsx"` (or a response served with a spreadsheet content type, or a
local `file:…xlsx` / `…xlsm`) reads every worksheet with
[`@opencraw/office-reader`](../../packages/office-reader). Numbers and booleans keep their type, so
`13955.625` is a number that no locale guess can misread. Dates become ISO text (`2026-06-01`,
`2026-06-01T09:30:00`), errors their text (`#DIV/0!`), and empty cells `''`. Formulas give their cached
value; nothing is evaluated, and display formats are not applied (a percentage stays `0.125`). Hidden sheets
and rows are read, and `table` skips them unless `includeHidden`. Merged ranges are recorded, and `table`
fills them. A legacy `.xls`, a password-protected file or an `.ods` fails the step, with what to do.

**CSV.** `request` with `as: "csv"` (or a response served as `text/csv`, `application/csv` or
`text/tab-separated-values`, or a local `file:…csv` / `…tsv`) reads the file into a **workbook**: a CSV is a
workbook with one sheet, named after the file (`…/prezzo_alle_8.csv` → `prezzo_alle_8`). Every cell stays
text; `number` with a `locale` and `date` with a `format` convert them in the mapping.

- **Encoding** as in §3.2: a Windows-1252 export with no charset reads right without `encoding`.
- **Delimiter** is detected among `,` `;` tab `|`: the one that splits the first lines into the most
  consistent number of fields, so a title line above the header does not mislead it, and `;` with decimal
  commas (`Panda;15.950,00`) is read as `;`. Set `delimiter` on the `request` when detection gets it wrong.
- **Quotes**: a quoted field may hold the delimiter, line breaks and `""`; a quote inside an unquoted field is
  kept as is (`1.0 Hybrid "Cross"`). Rows are kept ragged, nothing is trimmed.

The same three extract kinds read it:

| `kind` | Reads | Use for |
|---|---|---|
| `table` | tables, found by their header row | the list itself, below any title lines |
| `regex` | the text: cells separated by a tab, rows by a newline, sheets by a blank line | a date in a title line: `Estrazione del (\S+)` |
| `jsonpath` | the structure: `{ kind: "workbook", sheets: [{ name, rows: [["cell", …], …] }], csv: { encoding, delimiter } }` | a file with no header row: `$.sheets[0].rows[*]`; `merges`, `hidden` and `hiddenRows` too, for a spreadsheet |

A grid needs no geometry, so a workbook table is simpler than a PDF one: column *i* of a row belongs to header
cell *i*. The `selector` matches the header row (its non-empty cells joined by spaces, whitespace collapsed),
and each table is `{ sheet, title, header, rows }`. Before reading, every merged range's value is copied
into the cells it covers: a brand merged down its models reads on every row, and a group header merged
across its sub-columns names each of them.

```json
{ "type": "request", "url": "{{start.url}}" },
{ "type": "extract", "id": "table", "selector": "^Marca Modello", "kind": "table", "until": "^Totale",
  "fillDown": ["brand", "model"],
  "columns": { "brand": "^Marca$", "model": "^Modello$", "version": "^Versione$", "price": "^Prezzo" } },
{ "type": "set", "id": "rows", "value": "{{table.rows}}" },
{ "type": "forEach", "over": "rows", "as": "row", "emit": true, "steps": [] }
```

| Field | Meaning |
|---|---|
| `selector` | Matches the header row. Title lines above it and empty rows below it are skipped. |
| `until` | Matches the row that ends a table. A table also ends at the next header and at the sheet's end. `"^$"` ends it at the first empty row: several tables on one sheet, separated by blank rows. |
| `columns` | Output key → header pattern. Without it the header texts are the keys; a column with data but no header text is keyed by its letter (`A`, `B`…), and a repeated header gets a counter (`Price 2`). |
| `fillDown` | Output keys whose empty cells take the value of the row above: exports that write a brand or a model once over its versions. |
| `headerRows` | How many rows the header spans (default 1): a column's key joins its header texts (`Total` over `August` → `Total August`). |
| `sheet` | A pattern for the names of the sheets to read (default: all). |
| `includeHidden` | Read hidden sheets and rows too. |

A spreadsheet table under a two-row merged header (the German KBA registration statistics):

```json
{ "type": "extract", "id": "table", "kind": "table", "sheet": "^FZ 10\\.1$", "selector": "^Marke Modellreihe",
  "headerRows": 2, "until": "^NEUZULASSUNGEN INSGESAMT",
  "columns": { "brand": "^Marke$", "model": "^Modellreihe$", "month": "^Insgesamt August", "bev": "^mit Elektroantrieb \\(BEV\\) August" } }
```

`Insgesamt` is merged over *August 2026 · Jan.–August 2026 · Anteil in %*, so the three columns read as
`Insgesamt August 2026` and so on, and the brand merged down its models' rows fills every row.

`opencraw probe <url or file>` lists a workbook's sheets, the first rows, and every row that looks like a
header, with a ready `selector` (and a `headerRows` hint when the header has merged cells). For a CSV it
also reports the encoding and the delimiter it used.

### 4.8 Presentations

`request` with `as: "pptx"` (or a response served with a presentation content type, or a local
`file:…pptx`) reads the deck with [`@opencraw/office-reader`](../../packages/office-reader) into slides:

```
{ kind: "deck", width, height, slides: [{ number, title, hidden,
    shapes: [{ x, y, width, height, text, placeholder }],   // points from the top-left corner, reading order
    tables: [{ name, rows, merges }],                        // native tables, as sheets
    charts: [{ type, title, series: [{ name, categories, values }] }],
    notes }] }
```

A title placeholder that PowerPoint places through the slide's layout gets the layout's position, and boxes
inside a group are placed through its scaling. Slide numbers, dates and footers are left out. A legacy `.ppt`,
a password-protected file or an `.odp` fails the step, with what to do.

| `kind` | Reads | Use for |
|---|---|---|
| `table` | native tables, or with `shapes: true` text boxes laid out as a table | price and incentive tables |
| `regex` | per visible slide: its text boxes, its tables' rows (cells separated by a tab), then `Notes: …`; slides separated by a blank line | a validity date in the notes: `Notes: .*fino al (\d+ \w+)` |
| `jsonpath` | the structure above | chart data: `$.slides[?(@.title=='Vendite')].charts[*].series[*]` |

A **native table** reads like a spreadsheet table (§4.7). Merged cells are filled, `headerRows` joins a header
spread over several rows, and `slide` (a pattern on slide titles) picks the slides:

```json
{ "type": "extract", "id": "table", "kind": "table", "slide": "^Incentivi", "selector": "^Modello Prezzo", "headerRows": 2,
  "columns": { "model": "^Modello$", "list": "^Prezzo Listino$", "discount": "^Sconto$" } }
```

**Text boxes laid out as a table** read with `shapes: true`, through the PDF table reader (§4.6): each box is a
cell, boxes whose heights overlap form a row, and columns come from where the body's boxes start (`align`
applies). A very tall box can pull two rows together.

```json
{ "type": "extract", "id": "table", "kind": "table", "shapes": true, "slide": "^Griglia", "selector": "^Modello Prezzo",
  "columns": { "model": "^Modello", "price": "^Prezzo" } }
```

Each table is `{ slide, slideTitle, title, header, rows }`, and hidden slides are skipped unless
`includeHidden`. `opencraw probe <url or file.pptx>` lists the slides, each native table's header with a ready
`selector`, the charts' series, and the slides whose short text boxes look like a table.

### 4.9 YAML

`request` with `as: "yaml"` (or a response served as `application/yaml`, `text/yaml` or their `x-` forms, or a
local `file:…yaml` / `…yml`) parses the YAML into **JSON data**: `jsonpath`, `forEach` and `json` fields work
exactly as on a JSON response. Several documents (`---`) become an array of them.

- **YAML 1.2, always.** Under YAML 1.1, `country: NO` is `false`, `y` is `true` and `0123` is octal `83`. The
  parser is pinned to 1.2 even when the file declares `%YAML 1.1`, so `NO` stays `"NO"`.
- **`scalars: "text"`** on the `request` keeps every scalar as written. Even 1.2 reads `zip: 0123` as `123` and
  `version: 1.10` as `1.1`; with `"text"`, they stay `"0123"` and `"1.10"`, and transforms convert what needs
  converting.
- **Merge keys** (`<<: *defaults`) are applied, **anchors** expand with a cap (a "billion laughs" file fails),
  and **duplicate keys** fail the step with their line.
- **Custom tags** (`!!js/function`, `!custom`) never build values: the tagged value is read as a plain one, and
  the trace shows a warning.

### 4.10 Markdown

`request` with `as: "markdown"` (or a response served as `text/markdown`, or a local `file:…md`) renders
GitHub-flavoured Markdown (tables, task lists, strikethrough, autolinks) to an **HTML document**, so every
`css` selector works on it. GitHub raw and most CDNs serve Markdown as `text/plain`: set `as`. Two additions
make it easier to aim at:

- **Sections.** Each heading and everything up to the next heading of the same or a higher level is wrapped
  in `<section data-heading="…" data-level="…">`, sections nesting: the table under *Prezzi* is
  `section[data-heading='Prezzi' i] table`. Headings get GitHub's slug ids (`<h2 id="prezzi">`).
- **Front matter.** A leading `---` YAML block is parsed (YAML 1.2, as §4.9) and put in the head as
  `<script type="application/json" data-front-matter>`: read it the way JSON-LD is read.

```json
{ "type": "request", "url": "{{start.url}}", "as": "markdown" },
{ "type": "extract", "id": "front", "selector": "script[data-front-matter]", "kind": "css", "take": "text" },
{ "type": "extract", "id": "updated", "from": "front", "selector": "$.updated", "kind": "jsonpath" },
{ "type": "extract", "id": "table", "selector": "^Modello Versione", "kind": "table", "columns": { "model": "^Modello$", "price": "^Prezzo$" } }
```

In a GFM table a `|` inside a code span still splits the cell: the Markdown must write it `\|`. Raw HTML in the
Markdown is kept and selectable, and never runs (it is parsed, not loaded in a browser). To run a `regex` over
the Markdown source instead, request it with `as: "text"`.

### 4.11 HTML tables

`table` also reads an HTML document's `<table>`s: a fetched page, rendered Markdown, or, in web mode, the live
page. Every table becomes a grid: `thead`, `tbody` and `tfoot` rows in order, `th` and `td` alike, cell text
with whitespace collapsed, and `colspan` / `rowspan` as merged ranges. From there it is the grid table of §4.7:
the `selector` matches the header row, merged cells are filled, `headerRows` joins a header over two rows,
`fillDown` and `columns` work the same. A table inside a table is read on its own.

```json
{ "type": "extract", "id": "table", "kind": "table", "selector": "^Model Version", "headerRows": 2,
  "columns": { "model": "^Model$", "version": "^Version$", "urban": "^Consumption Urban$" } }
```

A model merged down its versions (`rowspan`) reads on every row, and *Consumption* over *Urban · Mixed*
(`colspan`) names both columns. It replaces a `css` extract per `tr` and a `take` per `td`. `probe` lists
every table's header row with a ready `selector`.

### 4.12 XML: feeds, sitemaps, open data

`application/xml`, `text/xml`, any `+xml` type (`application/atom+xml`, `application/rss+xml`), `.xml`, `.rss`,
`.atom` files and gzipped `.xml.gz` sitemaps are read as XML (`as: "xml"` forces it). Query them with `xpath`:

```json
{ "type": "request", "url": "https://shop.example/feed.xml" },
{ "type": "extract", "id": "entries", "selector": "//a:entry", "kind": "xpath", "namespaces": { "a": "http://www.w3.org/2005/Atom" }, "take": "json", "many": true },
{ "type": "forEach", "over": "entries", "as": "entry", "emit": true, "steps": [
  { "type": "extract", "id": "title", "from": "entry", "selector": "/a:entry/a:title", "kind": "xpath", "namespaces": { "a": "http://www.w3.org/2005/Atom" } },
  { "type": "extract", "id": "link", "from": "entry", "selector": "/entry/link/@href", "kind": "xpath", "ignoreNamespaces": true, "take": "value" }
] }
```

- **Namespaces.** An element in a namespace only matches a prefixed name. Prefixes the root element declares
  (`xmlns:media="…"`) are known already. A **default** namespace (`<feed xmlns="http://www.w3.org/2005/Atom">`) has
  no prefix, so give it one in `namespaces`, or set `ignoreNamespaces: true` and write plain names. `probe` prints
  the namespaces and the line to paste. `//*[local-name()='entry']` also works, but reads worse.
- **Take.** `text` collapses whitespace, `value` keeps a node's text as is (an attribute: `@href` with `take:
  "value"`), `attr:<name>` reads an element's attribute, `html` is the element's inner markup, `json` its outer
  markup: an entry to query again with `from`, its namespace declarations included. A function result
  (`count(//a:entry)`, `string(/a:feed/a:title)`) is taken as it is.
- **CDATA and entities.** `<![CDATA[600e <La Prima>]]>` and `&amp;` read as text. Entities a DOCTYPE declares are
  never expanded and nothing external is fetched: an XML bomb or an XXE stays inert text.
- **Sitemaps.** `//loc` with `ignoreNamespaces: true` lists a sitemap's pages; a `forEach` over them fetches each.
  A sitemap index lists sitemaps: nest a second `forEach`.
- **Other kinds on XML.** `css` works too (tag names keep their case; escape a prefix: `media\\:thumbnail`),
  `regex` reads the markup; `jsonpath` and `table` do not.

`xpath` also reads **fetched HTML** in api mode, parsed like a browser does: `//table[@class='variants']/tbody/tr`
matches a page whose markup has no `<tbody>`.

## 5. Mapping

```json
"mapping": {
  "actor":   { "from": "actor_name", "transform": [{ "op": "trim" }] },
  "year":    { "from": "year", "transform": [{ "op": "regex", "pattern": "(\\d{4})" }, { "op": "integer" }] },
  "price":   { "from": ["price_int", "price_cents"], "transform": [{ "op": "join", "separator": "." }, { "op": "currency" }] },
  "seller.name": { "from": "seller" },
  "variants": { "each": "variant_rows", "fields": {
    "size":  { "from": ".", "transform": [{ "op": "regex", "pattern": "<td class=\"size\">([^<]+)" }] }
  }}
}
```

- The key is an output field, dotted for members of `object` fields.
- `from` is an id or a path into one (`item.href`, `page.url`). Several sources give the chain a **list** of
  values (then `join`, `coalesce`, `sum`...).
- `each` builds an `array` of `object` from a list id; inside `fields`, `from` is relative to each item and
  `.` is the item itself.
- `onMissing` on a rule overrides the field's policy for this recipe.
- Generated fields are not mapped; required fields must be mapped, defaulted or generated. The binding
  validator enforces both at load time.

### 5.1 Transforms

Applied in order. A **scalar** op applied to a list runs on every item; a **list** op runs on the list. A
missing value (`undefined`, `null`) passes through every op except `default`, `template` and `hook`, so it
reaches the missing-value policy untouched.

| Op | Args | Kind | Does |
|---|---|---|---|
| `trim`, `lowercase`, `uppercase` | – | scalar | text ops |
| `replace` | `pattern`, `replacement`, `flags?` (default `g`) | scalar | regular-expression replace |
| `regex` | `pattern`, `group?`, `flags?` | scalar | the first match; group 1 by default when the pattern has one, else the whole match; **no match gives a missing value** |
| `split` | `separator` | scalar | text → list |
| `join`, `concat` | `separator` | list | list → text (`concat` defaults to no separator) |
| `first`, `last` | – | list | one item |
| `nth` | `index` (negative from the end) | list | one item |
| `slice` | `start`, `end?` | list | a sub-list |
| `coalesce` | – | list | the first item that is not missing or blank |
| `default` | `value` | list | replaces a missing or blank value |
| `number` | `locale?` | scalar | parse (`"1.299,00"` with `de-DE` → 1299) |
| `integer` | – | scalar | parse and truncate |
| `boolean` | `truthy?` | scalar | substring match against the phrases |
| `currency` | `locale?`, `currency?` | scalar | `{ amount, currency }`; the code from the arg, else the text's symbol or code |
| `date` | `format?`, `timezone?` | scalar | a Date; `format` tokens `YYYY MM DD HH mm ss`; `timezone` an IANA zone for text without an offset |
| `absoluteUrl` | `base?` | scalar | resolve against `base`, else `page.url` |
| `urlEncode` | – | scalar | percent-encodes one URL component (`encodeURIComponent`): `#` → `%23`, space → `%20`, `&` → `%26`, `+` → `%2B`, `é` → `%C3%A9` |
| `flatten`, `unique` | – | list | nested lists flattened; duplicates removed |
| `sum`, `count` | – | list | numbers |
| `template` | `value` | list | renders a template against the scope, ignoring the input |
| `jsonpath` | `path` | list | runs a JSONPath on the input data |
| `lookup` | `in` (an id or path in scope), `key`, `pick?` | scalar | finds the first item of the table `in` whose `key` path equals the value (compared as text) and yields `pick` from it, or the whole item; no match gives a missing value. The table may be data, JSON text or a list of JSON texts (one `data-*` attribute per element): §5.2 |
| `group` | `by` | list | `[{ key, items }]` in first-seen order; items without the path group under `null` |
| `hook` | `name`, `args?` | list | calls a registered hook with the value so far |

### 5.2 Joining two extractions

Sites split one record across places: the price table lists versions, a colour picker elsewhere on the
page carries a JSON per trim. `lookup` joins them at mapping time, so the body of the loop stays a plain
row read:

```json
{ "type": "extract", "id": "colour_data", "selector": "[data-vrdata]", "kind": "css", "take": "attr:data-vrdata", "many": true },
{ "type": "forEach", "over": "rows", "as": "row", "emit": true, "steps": [
  { "type": "extract", "id": "trim_base", "from": "label", "selector": "^'(GT-Line S|GT-Line|Air)", "kind": "regex" }
]}
```

```json
"colours": { "from": "trim_base", "transform": [
  { "op": "lookup", "in": "colour_data", "key": "trimname", "pick": "colors" },
  { "op": "jsonpath", "path": "$[*].displayName" }
]}
```

`in` is resolved against the scope of the record like a template path, so `colour_data` extracted outside
the loop is visible. Inside an `each` rule's `fields` the same holds: `in` (and a `template` transform's
paths) look in the current item first, then in the record, so one table extracted once per record can
annotate every row of a nested list:

```json
"options": { "each": "option_rows", "fields": {
  "code":    { "from": "code" },
  "content": { "from": "code", "transform": [{ "op": "lookup", "in": "componentsInfo", "key": "id", "pick": "text" }] }
}}
```

An item key with the same name as a record id wins. `from` inside `fields` stays relative to the item. Applied to a list, `lookup` runs per item. `group` goes the other way: one list of
rows becomes one item per distinct key, for an output field that is an array of objects (`each` over the
groups).

---

## 6. Hooks

The one extension point. Register functions when creating the crawler and reference them by name:

```ts
const crawler = createCrawler({ hooks: {
  positive: (input) => Number(input) > 0,
  geocode:  async (input, args, context) => { context.log('info', 'geocoding', { input }); return await lookup(String(input), args.country) },
}})
```

`(input, args, context) => value`, sync or async. From a `hook` **step**, `input` is `undefined` and the
result is bound under the step's `id`; from a `hook` **transform**, `input` is the value so far. `context`
gives `recipeId`, the scope snapshot and a `log`. A recipe naming an unregistered hook fails at the call.

**From the cli and the MCP server**, hooks come from a JavaScript module whose default export is the map
(named function exports work too):

```js
// hooks.mjs
export default {
  positive: (input) => Number(input) > 0,
}
```

```sh
opencraw run recipes/ --hooks hooks.mjs      # or OPENCRAW_HOOKS=hooks.mjs
```

The same file becomes a **plugins module** when it names its exports: `hooks` (the map), `accessPlugins`
([access.md](access.md#plugins)) and `captchaSolvers` (§6.1). `--plugins` / `OPENCRAW_PLUGINS` are the same
option under their own name.

```js
// plugins.mjs
export const hooks = { positive: input => Number(input) > 0 }
export const accessPlugins = [myProxyList]
export const captchaSolvers = [capsolver({ apiKey: process.env.CAPSOLVER_KEY })]
```

The MCP server reads `OPENCRAW_PLUGINS` / `OPENCRAW_HOOKS` from its own environment, never from a tool call: an agent can run
recipes that call your hooks but cannot make the server load a module of its choosing. The module runs as
your code, with your privileges, like anything you `import`: load only files you trust.

### 6.1 Captcha solvers

A captcha solver gets past one challenge on the live page. The engine does the rest: finding challenges,
checking the page afterwards, retrying, rotating, and capping what a run spends.

```ts
import type { CaptchaSolver } from '@opencraw/core'

const solver: CaptchaSolver = {
  name:  'my-solver',
  solve: async (challenge, { page, lease, attempt, signal, log }) => {
    // challenge: { kind, url, siteKey?, action?, selector? }
    const token = await myService.solve(challenge.kind, challenge.siteKey, challenge.url, { signal })
    await page.locator('[name="g-recaptcha-response"]').evaluate((field, value) => { field.value = value }, token)
    await page.locator('form').first().evaluate(form => form.submit())
    return { status: 'solved' }            // or { status: 'failed', reason: 'balance is zero' }
  },
}
const crawler = createCrawler({ captchaSolvers: [solver] })
```

A recipe names it in `session.captcha` (checked after every navigation, click and key press) or in a
`captcha` step (one known point, such as a login form):

```json
"session": { "captcha": { "solver": "my-solver", "verify": { "selector": "#results" }, "maxSolves": 5 },
             "onBlock": { "solve": true, "rotate": true } }
```

| Key | Default | Meaning |
|---|---|---|
| `solver` | | A registered solver's name. An unknown name fails the recipe before its first page. |
| `detect.selector` | the common widgets | Where challenges are: visible `.g-recaptcha`, `.h-captcha`, `.cf-turnstile`, or their iframes. |
| `verify` | `{ gone: true }` | How a solve is confirmed: the challenge is `gone` and/or an element (`selector`) appears. The solver's `solved` is only a claim. |
| `attempts` | 3 | Solves tried per challenge. |
| `timeoutMs` | 120000 | Time one solve may take; then `signal` aborts and the attempt fails. |
| `maxSolves` | 10 | Solves the whole run may spend, rotations and bootstrap included. `0` detects without paying. |

What happens:

1. **Detect.** The first visible match gives `kind` (`recaptcha-v2`, `hcaptcha`, `turnstile`, `image`,
   `unknown`; `recaptcha-v3` in a `captcha` step only), the `siteKey` (`data-sitekey`, or the iframe's `k` /
   `sitekey`) and a `selector` for the widget.
2. **Solve.** Each attempt spends one solve of `maxSolves`. The solver applies its answer on the page
   (injects a token and submits, types a text). A throw or a timeout is a failed attempt.
3. **Verify.** Up to 10 s for the page to confirm. A failed attempt re-detects (a widget re-renders after a
   wrong answer), or reloads when the widget is gone without confirming.
4. **Give up.** After `attempts`, or when `maxSolves` is spent, the step fails with a `CaptchaError`. It is a
   block, so `onBlock.rotate` retries the step on a new IP (often an easier challenge, or none), then the step's
   `onError` applies.

Solvers get the access `lease`: token services solve faster, and more often correctly, through the same proxy
as the browser. Api recipes cannot solve (there is no page): with `session.captcha`, a fetched page showing a
widget fails as a block that says so. Solve it in `session.bootstrap` and keep the cookies.

Solving captchas can break a site's terms of service. [captcha.md](captcha.md) has a working solver for
CapSolver, the costs, and when not to.

---

## 7. Policies: what happens when something is missing or fails

**A step fails** (selector without match, HTTP 404, timeout, hook throws). The policy is the step's
`onError`, else the recipe's, else `fail`:

| Policy | Effect |
|---|---|
| `fail` | The recipe stops with a `StepFailure` naming the step path. The next input recipe still runs unless the crawler was created with `onRecipeError: 'stop'`. |
| `skip` | The id stays unset, the walk continues, a `step:skip` event is reported. |
| `retry` | The step is re-run up to `attempts` times with linear `backoffMs`, then treated as `fail`. |

**A request fails in passing** (a dropped connection, a timeout, a 503, a 429). Before any of the above, the
engine sends the same request again: that is `limits.retry`, and it is **on by default**.

```json
"limits": { "retry": { "attempts": 4, "backoffMs": 500, "maxDelayMs": 20000, "statuses": [429, 502, 503, 504] } }
```

| Key | Default | Meaning |
|---|---|---|
| `attempts` | `3` | Tries per request, the first included. `1` turns it off. |
| `backoffMs` | `1000` | The first pause. It doubles on each retry, give or take 25% so parallel requests do not retry in step. |
| `maxDelayMs` | `30000` | The longest pause. A server whose `Retry-After` asks for longer is not retried: it means "come back much later". |
| `statuses` | `[408, 425, 429, 500, 502, 503, 504]` | Answers retried. Connection failures always are: resets, refusals, timeouts, a DNS lookup that could not run, a proxy that dropped the tunnel. A host that does not exist is not. |

- It covers every `goto`, `request` and `next.url` page. A `Retry-After` (seconds or a date) is honoured, and it
  holds back **every** request to that site, not only the one that got it.
- A retry is the same request again, on the same access lease. It does not spend the step's `onError` retries,
  and each one is a `request:retry` event (`↺` in the trace).
- When the tries run out, the last answer counts. A 429 or 403 that is still there becomes a block
  (`session.blockedWhen`), so `onBlock.rotate` takes over; a 503 fails the step, and the step's `onError` applies.
- The crawler sets the default for every recipe: `createCrawler({ retry: { attempts: 5 } })`, CLI `--retries <n>`.
  A recipe's `limits.retry` wins over it.

Like redialling a busy number: wait a moment, dial again, give up after a few tries. If the other end said "call
back in a minute", wait that minute.

**A mapped value is missing** (`undefined`, `null`, `""`; an empty list is a value). The policy is the
mapping rule's `onMissing`, else the field's, else `default` when the field has a `default`, else the
recipe's, else `fail` for required fields and `null` otherwise:

| Policy | Effect |
|---|---|
| `fail` | The recipe stops (`MappingFailedError`). |
| `skip-record` | This record is dropped and reported (`record:reject`); the walk continues. |
| `null` | The field is `null` (the field must be `nullable` or not `required`). |
| `default` | The field's `default`. |

**A value cannot be coerced** (`"call us"` into a `number`, a relative link into a `url`) follows the same
missing-value policy: `skip-record` drops the record, anything else stops the recipe.

**A transform throws** (a `number` op on `"OTR £"`, a hook error): the recipe stops, unless the mapping rule
itself says `onMissing: "skip-record"`, which reads as "without this field the record is worthless" and
drops just that record. Use it on the price of a table whose header row you cannot select away.

---

## 8. Loading, binding and running

```ts
import { createCrawler, jsonLinesSink, loadRecipeSet, traceLine } from '@opencraw/core'

const recipes = await loadRecipeSet({ output: 'recipes/movie.output.json', inputs: ['recipes/'] })
const crawler = createCrawler({
  sink:    jsonLinesSink('out/movies.jsonl'),          // default: memorySink()
  hooks:   { positive: input => Number(input) > 0 },
  dedupe:  'run',                                       // 'run' | 'recipe' | 'off'
  onRecipeError: 'continue',                            // or 'stop'
  browser: { headless: true },                          // Playwright launch settings
  onEvent: event => { const line = traceLine(event); if (line) console.log(line) },
})
const report = await crawler.run(recipes)
await crawler.close()
```

`loadRecipeSet` takes the output recipe apart from the inputs; `loadRecipes(source)` takes one source holding
all of them and finds the output recipe by its `kind`. Either reads recipes from anywhere, not only files:
a path to a `.json` or `.jsonl` file or a directory of them, JSON or JSON Lines text, the same as bytes
(`Buffer`, `ArrayBuffer`, `Blob`, `File`, a stream), decoded objects, or an array mixing these. A server
holding uploaded recipes in memory calls `loadRecipes(blob)` and never writes a file. The cli takes paths
only.

`loadRecipeSet` parses every file against its schema (`RecipeValidationError` lists every problem with its
JSON path) and then **binds** the inputs to the output (`RecipeBindingError`): every mapping key names an
output field, every `from` starts with a known id, required fields are covered, web steps stay in web
recipes, `next.selector` only in web mode, one emitting construct per path.

The report gives, per recipe: `emitted`, `rejected`, `duplicates`, `skipped` (records a resumed run already
had), `stepsSkipped` (steps whose `onError: skip` swallowed a failure: a check that found nothing), `pages`,
`durationMs`, and `error` when the recipe stopped. The sink summary says how many records were written and where.

**Resuming.** A long crawl that dies halfway does not have to start over. Open the sink in append mode and
ask the crawler to resume:

```ts
const crawler = createCrawler({ sink: jsonLinesSink('out/movies.jsonl', { append: true }), resume: true })
```

In append mode every line carries the record key as `_key`, and `open` reads the keys already in the file.
With `resume`, a record whose key the sink has is not written again: it is counted as `skipped` and
reported as `record:skipped`. The steps still run (the engine has to reach the record to know its key), so
a resumed run costs the requests but not the duplicates. Any sink can support this by implementing `has(key)`;
`memorySink` does. `resume` with a sink that cannot answer throws at `createCrawler`.

### 8.1 Events and the trace

Everything the engine does is an event: `recipe:start` / `recipe:finish`, `page:visit` (with the HTTP status),
`access:lease` / `access:blocked` / `access:rotate`, `request:retry`, `captcha:detected` / `captcha:solve` / `captcha:solved` /
`captcha:failed` / `captcha:budget`, `step:start` /
`step:finish` / `step:retry` / `step:skip` (with the step type, its id and its path such as
`steps.8.steps.2`), `step:branch`, `record:emit` / `record:reject` / `record:duplicate` / `record:skipped`,
`warning`, `error`. `traceLine`
turns an event into one indented line, so a recipe's route reads as a tree:

```text
▶ tmdb (api)
  ⇢ page 1  https://www.themoviedb.org/movie/949-heat
  · steps.0  request entry  312 ms
  · steps.1  extract entry_ld  4 ms
  · steps.3  extract actor_name  2 ms
  ⇢ page 1  https://www.themoviedb.org/person/1158-al-pacino
  · steps.5  request actor_page  401 ms
    · steps.8.steps.0  extract title  1 ms
    ↷ steps.8.steps.2  extract year  skipped: no match for td.year
  ✚ record ["Al Pacino","St. Vincent","tmdb"]
■ tmdb: 10 emitted, 0 rejected, 0 duplicates, 2 pages, 3006 ms
```

The example runners print it with `--trace`.

---

## 9. Method: how to write a recipe for a new site

A quick way to see where a site's data lives before writing selectors by hand: `@opencraw/cli`'s
`opencraw probe <url>` (add `--browser` to also watch the JSON a script fetches after load) lists JSON-LD
blocks, inline JSON objects, `.json` URLs, script hosts and API-looking links found in the page.
`@opencraw/mcp` gives an agent the same `probe`, plus `validate`, `run` and `list_recipes`, as MCP tools
instead of a terminal command.

1. **Find the data before the markup.** Fetch the page with a browser user agent and look for
   `application/ld+json`, inline JSON (`__NEXT_DATA__`, `window.__STATE__`) or an XHR the page calls. Data
   beats selectors: it does not move when the design changes.
2. **Decide the mode.** Data in the HTML → `api`. Data rendered by scripts, interactions needed, or a bot
   wall on plain HTTP → `web`.
3. **Map the route.** Listing → detail, or entry → link → list. Each hop is a `goto` / `request` whose URL
   is a template over an id extracted on the previous page.
4. **Write the output first.** What is required, what is a key, what may be null.
5. **Extract with ids named after what they hold**, not where they come from (`actor_href`, not `link3`).
6. **Say what is optional.** `onError: skip` on extracts that legitimately miss; `nullable` on their fields.
   Leave everything else strict so a site change fails loudly.
7. **Run with `maxRecords: 3` and `--trace`.** Check the first record by hand against the page. Then lift
   the limit.
8. **Write the `description`.** The route, the reason it works, the element that is the pivot.

---

## 10. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `no match for <selector>` on the first extract of a page | wrong selector, or the page is a challenge / login wall | print `page:visit` URLs; fetch the page and look; on a bot wall switch to `web` or run through a proxy ([access.md](./access.md)) |
| `none of the N texts bound to "x" is JSON` | the scripts are not JSON-LD, or hold JavaScript | check the block; `evaluate` in web mode is the fallback |
| a field carries the *next* row's value | the row selector matched a wrapper element first | select the innermost repeating element (§4.5) |
| `"…" is not a URL and no page is known` | a relative URL before any navigation | make the first step `goto` / `request` with `{{start.url}}` |
| `mapping.x.from: "y" does not start with a known id` | typo in an id, or the id is bound only in a bootstrap | ids are per recipe; bootstraps produce a session, not ids |
| `record rejected: title: missing` on every record | the id is bound in a sibling scope, not the emitting one | extract inside the `forEach` body, or before it |
| the crawl stops after page 1 in web mode | the body navigated away and `next.selector` is not on the page | the engine returns to the listing page; if the listing is itself reached by clicking, use `next.url` |
| `HTTP 202` with an empty body | AWS WAF challenge | a real browser from a non-flagged IP: a residential proxy profile ([access.md](./access.md)) |
