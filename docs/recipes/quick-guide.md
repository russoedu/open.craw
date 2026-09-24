# Writing recipes

A crawl is two kinds of JSON file: **one output recipe** that says what a record looks like, and **input
recipes** that say how to get there from a site or an API. The engine runs the inputs one after another and
every record, whatever its source, matches the output. The formal specification is
[requirements.md](./requirements.md); this is the working guide.

Point `$schema` at `packages/core/schemas/output-recipe.schema.json` or `input-recipe.schema.json` and your
editor validates and completes the file as you type.

## 1. The output recipe

```json
{
  "kind": "output", "id": "product", "version": 1,
  "fields": {
    "url":     { "type": "url", "required": true, "key": true },
    "title":   { "type": "string", "required": true },
    "price":   { "type": "currency", "currency": "EUR", "required": true },
    "inStock": { "type": "boolean", "default": false, "onMissing": "default" },
    "images":  { "type": "array", "items": { "type": "url" } },
    "seller":  { "type": "object", "fields": { "name": { "type": "string" } } },
    "scrapedAt": { "type": "datetime", "generated": "now" }
  }
}
```

- `key: true` fields identify a record; a repeated key is dropped as a duplicate.
- `required` fields fail the recipe when missing, unless `onMissing` says `skip-record` (drop the record),
  `null`, or `default` (use `default`).
- `generated` fields come from the engine: `now`, `uuid`, `sourceUrl`, `recipeId`. Do not map them.
- Types: `string`, `number`, `integer`, `boolean`, `date` (`YYYY-MM-DD`), `datetime` (ISO 8601), `currency`
  (`{ amount, currency }`), `url` (absolute), `enum` (`values`), `array` (`items`), `object` (`fields`).

## 2. The input recipe

```json
{
  "kind": "input", "id": "shop-web", "output": "product", "mode": "web",
  "start": [{ "url": "https://shop.example/catalog?page=1" }],
  "steps": [ ... ],
  "mapping": { ... }
}
```

`mode` is `web` (a real browser) or `api` (HTTP requests, no browser). `start` lists where to begin; each
start point runs the whole step list with `start.url` and its `vars` in scope.

### Steps

Every step can have an `id` (the name of the value it produces), an `onError` policy and a `when` template.

| Step | Mode | What it does |
|---|---|---|
| `goto` | web | Navigates to `url` (a template, relative to the current page). |
| `click`, `fill`, `press`, `scroll`, `wait`, `screenshot` | web | Interacts with the page. `click` with `optional: true` skips a missing element. |
| `evaluate` | web | Runs `script` in the page and binds the result. Trusted recipes only. |
| `request` | api | Sends an HTTP request; the response becomes the current document (and the `id`, if given). `as` forces `json`, `html` or `text`. A relative `url` resolves against the current page, like a link. |
| `extract` | both | Selects from the current document (or the `from` id): `kind` is `css`, `xpath` (live page only) or `jsonpath`; `take` is `text` (default), `html`, `value`, `json` or `attr:href`; `many: true` gives a list. A single `extract` that matches nothing fails, so give it `onError: { "policy": "skip" }` when the element is optional. |
| | | A `jsonpath` extract whose `from` holds **text** parses it as JSON, and a **list of texts** (every `script[type="application/ld+json"]` of a page, extracted with `many`) becomes an array of the entries that parse: `$[*].actors[*].name` then finds the block that has actors wherever it sits. |
| `set` | both | Binds a literal or a rendered template. |
| `forEach` | both | Runs `steps` once per item of the list `over`, with the item bound as `as`. `emit: true` produces one record per iteration. |
| `paginate` | both | Runs `steps` per page, then follows `next`: `{ "selector" }` (web, clicks it), `{ "url" }` (a template), `{ "jsonpath" }` (api, a URL from the document; add `"as"` to bind a cursor instead). Stops when there is no next page, when `until` is truthy, or at `maxPages`. |
| `emit` | both | Produces a record from everything in scope. |
| `hook` | both | Calls a handler registered in code by `name`, with `args`. |

### Templates

`{{path}}` reads any id in scope, the `forEach` variable (`{{item.href}}`), `{{vars.name}}`,
`{{start.url}}`, `{{page.url}}` and `{{page.number}}`. A template that is exactly one placeholder keeps the
value's type, so `"over": "links"` and `"{{links}}"` both give the list.

### Scope, in one paragraph

`forEach` and `paginate` open a fresh scope per iteration or page and drop it afterwards, so page 2 never
sees page 1's values. Navigations inside a `forEach` (visiting every product) are fine: `paginate` returns to
the listing page before looking for the next link. `page.url` is the current page in web mode and the last
request's URL in api mode.

### Errors

`onError` on a step, else on the recipe, else `fail`: `{ "policy": "skip" }` leaves the id unset and
continues, `{ "policy": "retry", "attempts": 3, "backoffMs": 500 }` retries, `fail` stops the recipe. A
stopped recipe never stops the run unless the crawler was created with `onRecipeError: 'stop'`.

## 3. Mapping

```json
"mapping": {
  "url":         { "from": "page.url" },
  "title":       { "from": "raw_title", "transform": [{ "op": "trim" }] },
  "price":       { "from": "raw_price", "transform": [{ "op": "regex", "pattern": "([\\d.,]+)" }, { "op": "currency", "locale": "de-DE" }] },
  "price2":      { "from": ["price_int", "price_cents"], "transform": [{ "op": "join", "separator": "." }, { "op": "currency" }] },
  "images":      { "from": "imgs", "transform": [{ "op": "absoluteUrl" }, { "op": "unique" }] },
  "variants":    { "each": "variant_rows", "fields": { "size": { "from": ".", "transform": [{ "op": "regex", "pattern": "<td class=\"size\">([^<]+)" }] } } },
  "seller.name": { "from": "seller" }
}
```

- The key is an output field, dotted for nested objects.
- `from` is an id or a path into one; several sources give the chain a list.
- `each` builds an array of objects from a list; inside, `from` is relative to each item (`.` is the item).
- A scalar transform applied to a list runs on every item. A missing value passes through every transform
  except `default`, `template` and `hook`, then meets the field's missing policy.
- The ops: `trim`, `lowercase`, `uppercase`, `replace`, `regex`, `split`, `join`, `first`, `last`, `nth`,
  `slice`, `concat`, `coalesce`, `default`, `number`, `integer`, `boolean`, `currency`, `date`,
  `absoluteUrl`, `flatten`, `unique`, `sum`, `count`, `template`, `jsonpath`, `hook`.

## 4. Sessions and logins

```json
"session": {
  "bootstrap": {
    "keep": ["cookies"],
    "steps": [
      { "type": "goto", "url": "https://shop.example/login" },
      { "type": "fill", "selector": "#user", "value": "{{vars.user}}" },
      { "type": "fill", "selector": "#pass", "value": "{{vars.pass}}" },
      { "type": "click", "selector": "button[type=submit]" },
      { "type": "wait", "selector": "#logged-in" }
    ],
    "saveTo": "state/shop.json"
  }
}
```

The bootstrap always runs in a browser. What it keeps is handed to the recipe: a `web` recipe starts its
page from it, an `api` recipe sends its cookies with every request. `storageStatePath` reuses a state saved
by `saveTo` on a later run. `headers`, `cookies`, `userAgent` and `viewport` apply to both modes.

## 5. Running

```ts
import { createCrawler, jsonLinesSink, loadRecipeSet } from '@open.craw/core'

const recipes = await loadRecipeSet({ output: 'recipes/product.output.json', inputs: ['recipes/'] })
const crawler = createCrawler({
  hooks:   { positive: input => Number(input) > 0 },
  sink:    jsonLinesSink('out/products.jsonl'),
  onEvent: event => console.log(event.type, event),
})
const report = await crawler.run(recipes)
await crawler.close()
```

`loadRecipeSet` validates every file and checks that each input can feed the output (mapped fields exist,
ids are bound, required fields are covered, web steps stay in web recipes). Errors list every problem with
its JSON path. The report says, per recipe, how many records were emitted, rejected or dropped as
duplicates, how many pages were visited, and the error that stopped it, if any.
