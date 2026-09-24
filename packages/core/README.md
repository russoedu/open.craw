# @open.craw/core

The recipe-driven crawler engine. See the [repository README](../../README.md) for the concept, the
[recipe guide](../../docs/recipes/authoring.md) for authoring recipes and [`docs/requirements.md`](../../docs/requirements.md)
for the specification.

```sh
npm install @open.craw/core
npx playwright install chromium   # web recipes and browser bootstraps only
```

## API

| Export | Purpose |
|---|---|
| `loadRecipeSet({ output, inputs })` | Reads, validates and binds recipe files (or decoded JSON). Throws `RecipeValidationError` / `RecipeBindingError` with every problem and its JSON path. |
| `createCrawler(options)` | Builds an engine: `hooks`, `sink` (`memorySink()` default, `jsonLinesSink(path, { append? })`), `onEvent`, `browser` settings, `dedupe` (`run` / `recipe` / `off`), `onRecipeError` (`continue` / `stop`), `resume` (skip keys the sink already has). |
| `crawler.run(set)` | Runs every input recipe in sequence; returns a `CrawlReport`. |
| `crawler.close()` | Closes the browser, if one was launched. |
| `parseInputRecipe`, `parseOutputRecipe`, `inputRecipeJsonSchema`, `outputRecipeJsonSchema` | The contracts, for tooling. |

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
```

`e2e/` holds the fixture shop and the browser suite (`nx run core:e2e`); `tools/` emits `schemas/`.
Set `OPEN_CRAW_CHROMIUM=/path/to/chrome` to run the e2e suite with a browser other than the one
`playwright install` fetched.
