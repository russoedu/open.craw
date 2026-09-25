# Recipe-based, data-driven crawler engine: requirements

This is the specification `@open.craw/core` is built and checked against. The user guide is
[recipes.md](./recipes/authoring.md); the code layout is in [architecture/vertical-feature-slices.md](./architecture/vertical-feature-slices.md).

## 1. Architecture and philosophy

**Data-driven core.** One reusable engine owns execution: the Playwright browser lifecycle, HTTP requests, the
step walk, the transformation pipeline and the output pipeline. It has no knowledge of any site. Everything
site-specific lives in configuration.

**Three pillars of configuration.**

1. **Input recipes** (`kind: "input"`, a list): where to start, whether to drive a browser (`web`) or call HTTP
   endpoints (`api`), the ordered steps that acquire raw values, and the mapping from those values to the output.
2. **One output recipe** (`kind: "output"`): the typed schema of the records the crawl must produce, with
   quality rules and what to do when a value is missing.
3. **The id-based transformation layer**: every step that produces a value names it with an `id`; the
   mapping binds output fields to one or more ids through a chain of pure transforms, with programmatic hooks
   for the cases JSON cannot express.

**Binding.** An input recipe names its output by id (`"output": "product"`). A run takes one output recipe and
a list of input recipes bound to it and executes the inputs **one after another**. All inputs bound to the same
output produce records of the same shape, whatever their source or mode.

**Sessions.** `api` mode reuses Playwright's request context, so a browser-driven bootstrap (a login, a consent
wall) can hand its cookies and local storage to the API calls unchanged. Nothing else in the engine cares which
mode produced the session.

**Extension.** Hooks are registered in code by name (`createCrawler({ hooks })`) and referenced from recipes in
a `hook` step or a `hook` transform. That is the only extension point: recipes stay declarative and shareable.

## 2. Input recipe (`InputRecipe`)

| Field | Meaning |
|---|---|
| `id` | Lowercase letters, digits, hyphens. Unique within a run. |
| `output` | The output recipe id this recipe feeds. |
| `mode` | `web` (Playwright browser page) or `api` (Playwright request context, no browser). |
| `start` | One or more `{ url, vars? }`; each start point runs the whole step list. |
| `vars` | Recipe-level variables, read in templates as `{{vars.name}}`. |
| `session` | Headers, cookies, user agent, viewport, a saved `storageStatePath`, a `bootstrap`, `access` (`{ profile?, country?, sticky? }`), `blockedWhen` and `onBlock` (section 2.1). |
| `limits` | `maxRecords` (exact, whatever is in flight), `delayMs` (minimum interval between request starts across the recipe), `timeoutMs`, `concurrency` (`forEach` iterations in flight, api mode; default `1`). |
| `onError` | Default step policy: `fail`, `skip`, or `retry { attempts, backoffMs }`. |
| `steps` | The acquisition recipe (section 2.2). |
| `mapping` | Output field path -> mapping rule (section 4). |

### 2.1 Session bootstrap

`session.bootstrap` runs its `steps` in a browser **before** the crawl, then captures what `keep` lists
(`cookies`, `localStorage`) as a Playwright storage state, optionally saved to `saveTo`. A `web` recipe starts
its page from that state; an `api` recipe seeds its request context with it. Bootstrap steps are web steps only
and never emit records.

**Access.** `session.access` says what the site needs (a profile name, a country, stickiness); the runner's
access config (`CrawlOptions.access`, CLI `--access`, env `OPEN_CRAW_ACCESS`) says how: named profiles of kind
`direct`, `proxy` (a server and username/password templates, or a provider `preset`), `pool` (a list rotated per
lease), `cdp` (a remote browser: `chromium.connectOverCDP` on a templated endpoint; web recipes only, the bootstrap
runs in the same remote session, the provider's context is reused) or `plugin` (a registered `AccessPlugin`, which
may return a proxy or a CDP endpoint). Every profile string is a template over `env.*`, `params.*`,
`session` (a new random id per sticky lease), `country` and `recipe.id`; an unset `env` variable fails the recipe
with its name. Each recipe run takes one lease, shared by its bootstrap and its runner and applied to the browser
context (proxy, extra headers, `ignoreHTTPSErrors`, blocked resource types) and to the HTTP request context. The
lease is reported as an `access:lease` event without credentials. Authenticated SOCKS proxies are refused at load:
Chromium does not send SOCKS credentials.

**Blocks.** Every navigation and request is checked against `session.blockedWhen` (`status`, `header` patterns,
`text` pattern; default 403, 429 or `x-amzn-waf-action: challenge`). A match raises a `BlockedError` and an
`access:blocked` event. With `session.onBlock: { rotate: true, attempts? }` the run keeps the old lease until it ends, takes a
new lease, opens a new runner on it (bootstrap included) and retries the step, without spending the step's retry
attempts. It rotates at most `attempts` times (default 2), and a block seen by several concurrent iterations of
one lease rotates once. Otherwise the block fails the step like any error. Replaced runners are disposed when the
run ends. See `docs/recipes/access.md`.

### 2.2 Steps

Every step has `type`, an optional `id` (the name of the value it produces), an optional `onError` and an
optional `when` template that must render truthy for the step to run.

| Step | Mode | Produces | Fields |
|---|---|---|---|
| `goto` | web | – | `url` (template), `waitUntil?` |
| `click` | web | – | `selector` or `target`, `optional?` |
| `fill` | web | – | `selector` or `target`, `value` (template) |
| `press` | web | – | `key`, `selector?` or `target?` |
| `select` | web | – | `selector` or `target`, one of `value`, `label`, `index` |
| `scroll` | web | – | `to: 'bottom' \| selector`, `times?`, `untilStable?` |
| `wait` | web | – | one of `selector`, `ms`, `state: 'networkidle'` |
| `evaluate` | web | value | `script`, JavaScript run in the page. Trusted recipes only. |
| `screenshot` | web | – | `path` |
| `request` | api | document | `method?`, `url`, `query?`, `headers?`, `body?`, `as: 'json' \| 'html' \| 'text'` |
| `extract` | both | value or list | `selector` (a template), `kind: 'css' \| 'xpath' \| 'jsonpath' \| 'regex'`, `take`, `many?`, `from?` |
| `set` | both | value | `value` (template or literal) |
| `forEach` | both | – | `over` (a list id) or `selector` (web: live elements), `as` (variable), `steps`, `emit?: true \| { output }` |
| `if` | both | – | `test` (template), `steps`, `else?`; the chosen branch runs in the current scope |
| `paginate` | both | – | `next`, `until?` (template), `maxPages?`, `steps` |
| `emit` | both | record | `output?` |
| `hook` | both | value | `name`, `args?` |

`take` is `text` (default), `html`, `value`, `json` or `attr:<name>`. `xpath` works on live pages only; on
fetched HTML use `css`; on JSON use `jsonpath`. A `jsonpath` extract whose `from` is text parses it as JSON; a list of
texts becomes the array of its parsable entries (the JSON-LD blocks of a page), and the path runs over that array.

**Templates** are `{{ }}` placeholders resolved against the scope: a path (any id, the current `forEach`
variable, `vars.*`, `start.url`, `page.url`, `page.number`) or an expression over paths: literals,
`+ - * / %`, `== != < <= > >=`, `&& || !`, `??`, `a ? b : c`, parentheses and a fixed set of functions
(`upper lower trim len default round number join first last replace contains split`). A placeholder made
only of path characters is a path (so `price-1` is a path and `price - 1` a subtraction). A template that
is exactly one placeholder yields the raw value (a list stays a list). Templates never execute code: the
expression is parsed into a tree and walked, paths read own properties of plain data only, a function
value reads as missing, and nesting and length are bounded.

`target` is a template that renders to a live element or to a selector string, so an interaction can land
on the element a `forEach` over `selector` is visiting.

**Live elements.** `forEach` with `selector` (web mode only) snapshots every matching element once, when
the loop starts, as `{ selector, index, text, html, attrs, value? }`, and binds one snapshot per iteration
under `as`. The engine keeps no element handle: `target` re-resolves the element by selector and index on
every use, so a page that re-renders after each interaction (a configurator) still iterates correctly.

### 2.3 Scope and pagination rules

- `forEach` opens a **fresh child scope per iteration**; `paginate` opens one **per page**. A child scope is
  dropped when its iteration or page ends: nothing from page 1 is visible on page 2.
- `page.url`, `page.number` and the current document are scope state, bound in the innermost scope that
  navigated. In `web` mode `page.url` is the real page URL after the last navigation; in `api` mode it is the
  final URL of the nearest `request` up the chain, and `start.url` before any request. `extract` without
  `from` reads the current document of the nearest scope that has one.
- `paginate.next` is evaluated **after** the page body: `{ selector }` (web: click it), `{ url }` (both: the
  rendered value becomes the next `page.url`), `{ jsonpath, as? }` (api: evaluated on the current document;
  without `as` the value is the next URL, relative allowed; with `as` it is bound under that name in the next
  page's scope so the body builds the URL itself, e.g. a cursor). Pagination stops when `next` yields nothing,
  when `until` renders truthy, or at `maxPages`.
- `if` evaluates `test` with `when`'s truthiness and runs `steps` or `else` in the **same scope** (no child):
  ids bound in a branch are visible after it. The engine reports the branch taken as a `step:branch` event.
- **One emitting construct per path**: an emitting `forEach` may not contain another emitting `forEach` or
  an `emit`. The two branches of an `if` are separate paths. `emit` snapshots the whole scope chain, child values shadowing parents.
- `limits.maxRecords` stops the walk cleanly once reached. Emits are serialised, so the count is exact under
  concurrency; iterations in flight finish without emitting.
- **Concurrency** is one gate per recipe run: `concurrency` permits shared by every `forEach` in it (the
  outermost concurrent loop takes them; a loop inside one of its iterations runs sequentially) plus one
  throttle (`delayMs` between request starts). Web mode is always sequential: one page.
- **Resume**: with `CrawlOptions.resume` the engine asks the sink `has(key)` for each mapped record and
  skips the ones it has (`record:skipped`, counted as `skipped`). `jsonLinesSink(path, { append: true })`
  writes `_key` per line and reads the keys back on open.

## 3. Output recipe (`OutputRecipe`)

| Field | Meaning |
|---|---|
| `id`, `version`, `description?` | Identity. |
| `fields` | Name -> `FieldSpec`. Names have no dots. |
| `onMissing?` | Recipe default: `fail`, `skip-record` or `null`. Built-in default is `fail` for required fields, `null` otherwise. |

`FieldSpec`: `type` (`string`, `number`, `integer`, `boolean`, `date`, `datetime`, `currency`, `url`, `enum`,
`array`, `object`), `required?`, `nullable?`, `default?`, `onMissing?` (`fail`, `skip-record`, `null`,
`default`), `key?` (record identity for de-duplication), `generated?` (`now`, `uuid`, `sourceUrl`,
`recipeId`; supplied by the engine, never mapped), `format?` (input format for dates; output is ISO 8601),
`currency?` (ISO 4217), `values?` (enum), `items?` (array element spec), `fields?` (object members), `min?`,
`max?`, `pattern?`, `minLength?`, `maxLength?`.

A `currency` value is stored as `{ amount: number, currency: string }`. A `date` is `YYYY-MM-DD`, a
`datetime` an ISO 8601 instant.

## 4. Mapping and transformation

```ts
type MappingRule =
  | { from: string | string[], transform?: TransformRule[], onMissing?: MissingPolicy }
  | { each: string, fields: Record<string, MappingRule>, onMissing?: MissingPolicy }
```

- The mapping key is an output field path, dotted for nested objects (`seller.name`).
- `from` is an id or a path into one (`item.href`, `page.url`). With several sources the chain starts on the
  array of resolved values (`["price_int", "price_cents"]` -> `join`).
- `each` builds an array of objects from a list id; the nested `from` paths are relative to each list item
  (`.` is the item itself).
- Transforms run in order. Built-ins: `trim`, `lowercase`, `uppercase`, `replace`, `regex` (capture group),
  `split`, `join`, `first`, `last`, `nth`, `slice`, `concat`, `coalesce`, `default`, `number` (locale aware),
  `integer`, `boolean` (`truthy` list), `currency` (locale aware; currency from the op, else the field),
  `date` (`format`, `timezone`), `absoluteUrl` (base from the op, else `page.url`), `flatten`, `unique`,
  `sum`, `count`, `template`, `jsonpath`, `lookup` (`in`: a table bound in scope as data, JSON text or a
  list of JSON texts; `key`: the path compared, as text, with the value; `pick?`: the path returned), `group`
  (`by`: a path; yields `[{ key, items }]` in first-seen order), `hook`.
- A transform applied to a list applies to each element, except the collection ops (`first`, `last`, `nth`,
  `slice`, `join`, `concat`, `coalesce`, `flatten`, `unique`, `sum`, `count`, `group`), which act on the list.
- After the chain, the value is coerced and validated against the `FieldSpec`.

### 4.1 Precedence of policies

1. A step failure resolves step `onError` -> recipe `onError` -> `fail`. `skip` leaves the id unset and
   continues; `retry` re-runs the step; `fail` aborts the recipe.
2. A missing mapped value resolves mapping rule `onMissing` -> field `onMissing` -> recipe `onMissing` ->
   built-in default. `fail` aborts the recipe; `skip-record` rejects the record and continues; `null` and
   `default` fill the value.
3. Whether a failed recipe stops the run is a run option (`onRecipeError: 'continue' | 'stop'`, default
   `continue`), never a recipe concern.

### 4.2 Identity and duplicates

Fields marked `key` form the record identity. De-duplication scope is a run option: `run` (default, across
all inputs, first record wins), `recipe`, or `off`. A record with no key fields is never de-duplicated.
Duplicates are reported as events and counted in the report.

## 5. Interfaces

The TypeScript contracts are the zod schemas in `packages/core/src/recipe-schema/`; the JSON Schemas emitted
from them are in `packages/core/schemas/` and are what a recipe's `$schema` should point at. The public API is
`packages/core/src/index.ts`:

```ts
const recipes = await loadRecipeSet({ output: 'recipes/product.output.json', inputs: ['recipes/'] })
const crawler = createCrawler({ hooks, sink: jsonLinesSink('out.jsonl'), onEvent, access: await loadAccessConfig('access.json') })
const report = await crawler.run(recipes)
await crawler.close()
```

Recipes load from any source, not only files: `loadRecipes(source)` takes one source holding the output
recipe and its inputs (found by `kind`), `loadRecipeSet({ output, inputs })` takes them apart. A source is a
path (a `.json` or `.jsonl` file, or a directory of them), JSON or JSON Lines text (a string starting with
`{` or `[`), the same text as bytes (`Buffer`, typed array, `ArrayBuffer`, `Blob`, `File`, a stream),
decoded recipe objects, or an array mixing these, so a server can run recipes it holds in memory. Every
validation error names the recipe's origin: its path, `path:line`, a `File`'s name, or its position.

## 6. Example

The recipes in `packages/core/e2e/recipes/` are the reference example: one `product` output recipe, a `web`
input recipe that paginates a catalog and visits every product page, and an `api` input recipe that logs in
through a browser bootstrap and then pages through a JSON endpoint. Both must produce the same records; the
e2e suite asserts it.
