# @opencraw/core

The recipe-driven crawler engine. See the [repository README](../../README.md) for the concept, the
[recipe guide](../../docs/recipes/authoring.md) for authoring recipes and [`docs/requirements.md`](../../docs/requirements.md)
for the specification.

```sh
npm install @opencraw/core
npx playwright install chromium   # web recipes and browser bootstraps only
```

## API

| Export | Purpose |
|---|---|
| `loadRecipes(source)` | Reads, validates and binds recipes from one source holding all of them, the output recipe found by its `kind`. The source is any of the forms below. Throws `RecipeValidationError` / `RecipeBindingError` with every problem and its JSON path. |
| `loadRecipeSet({ output, inputs })` | The same, with the output recipe given apart; each part is any of the forms below. |
| `readRecipeSource(source)` | Decodes recipes without validating them, each with where it came from, for tooling. |
| `createCrawler(options)` | Builds an engine: `hooks`, `sink` (`memorySink()` default, `jsonLinesSink(path, { append? })`), `onEvent`, `browser` settings, `dedupe` (`run` / `recipe` / `off`), `onRecipeError` (`continue` / `stop`), `resume` (skip keys the sink already has), `access` + `accessPlugins` (proxy profiles, see [access.md](../../docs/recipes/access.md)). |
| `loadAccessConfig(path)`, `AccessBroker`, `ACCESS_PRESETS` | Access configs: load and validate one, lease a profile outside a crawl (the cli's `probe` does), list the provider presets. |
| `crawler.run(set)` | Runs every input recipe in sequence; returns a `CrawlReport`. |
| `crawler.close()` | Closes the browser, if one was launched. |
| `readPdf(bytes)`, `findTables(pdf, query)`, `pdfText(pdf)` | The PDF reader and table extractor `request as: "pdf"` and `extract kind: "table"` use, for tooling. |
| `csvWorkbook(text, options)`, `parseCsv(text, delimiter)`, `detectDelimiter(text)`, `findGridTables(workbook, query)`, `workbookText(workbook)` | The CSV reader and the workbook table extractor `request as: "csv"` / `"xlsx"` and `extract kind: "table"` use, for tooling. Spreadsheets are read by [`@opencraw/office-reader`](../office-reader). |
| `findDeckTables(deck, query)`, `deckText(deck)` | The deck table extractor and text `request as: "pptx"` uses, for tooling; presentations are read by [`@opencraw/office-reader`](../office-reader). |
| `HttpClient`, `BrowserClient` | The same clients the engine's runners use, for tooling built on top of `@opencraw/core` (`@opencraw/cli`'s `probe` command uses both). |
| `parseInputRecipe`, `parseOutputRecipe`, `inputRecipeJsonSchema`, `outputRecipeJsonSchema`, `accessConfigJsonSchema` | The contracts, for tooling. |

A recipe source is any of:

| Form | Example |
|---|---|
| A path: a `.json` or `.jsonl` file, or a directory of them | `'recipes/'`, `'recipes/bundle.jsonl'` |
| JSON or JSON Lines text: a string starting with `{` or `[` | `'{"kind":"output",...}\n{"kind":"input",...}'` |
| Bytes of either: `Buffer` or any typed array, `ArrayBuffer`, `Blob`, `File`, a stream (Node `Readable`, web `ReadableStream`) | `formData.get('recipes')` |
| Decoded recipe objects | `[outputRecipe, ...inputRecipes]` |
| An array mixing the above | `['recipes/product.output.json', uploadedBlob]` |

A JSON file or text holds one recipe or an array of them; JSON Lines holds one recipe per line. Errors name
where each recipe came from: the path, `path:line` in a JSON Lines file, a `File`'s name, or `recipes[2]` /
`recipes:3` for recipes from memory.

```ts
// On a server, with the recipes in memory rather than on disk:
const recipes = await loadRecipes(file)   // a File from a multipart upload: JSON Lines, output recipe anywhere in it
const report = await createCrawler({ sink: memorySink() }).run(recipes)
```

Hooks are plain functions `(input, args, context) => value`, referenced from recipes by name in a `hook`
step or a `hook` transform.

## Layout

`src/` is a set of flat, role-suffixed slices (see the [ADR](../../docs/architecture/vertical-feature-slices.md)):

```text
recipe-schema     zod contracts, validation, JSON Schema      template          {{ }} rendering, dotted paths
extraction-scope  values by id, nested per page/iteration     selection         jsonpath-plus, cheerio
hooks             the named-handler registry                  crawl-events      the event bus
http-session      Playwright request context                  browser-session   Playwright browser
step-flow         forEach / paginate / emit / policies        api-steps         request + extract runner
web-steps         goto / click / extract runner               transformation    the built-in ops
output-mapping    ids -> validated records                     record-sink       memory, JSON Lines, dedupe
recipe-loading    files -> a bound RecipeSet                   crawl-execution   sessions, runs, reports
access            proxy profiles, presets, leases, plugins
```

`e2e/` holds the fixture shop and the browser suite (`nx run core:e2e`); `tools/` emits `schemas/`.
Set `OPENCRAW_CHROMIUM=/path/to/chrome` to run the e2e suite with a browser other than the one
`playwright install` fetched.
