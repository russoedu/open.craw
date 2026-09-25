# open.craw

A recipe-driven crawler for Node.js. The engine is generic; everything site-specific is JSON:

- an **output recipe** declares the records you want (fields, types, quality rules);
- **input recipes** declare how to get them from a site, driving a real browser (Playwright) or calling
  HTTP endpoints (Playwright's request context, so a browser login hands its cookies to the API calls);
- an **id-based mapping** binds what the steps extracted to the output fields through pure transforms,
  with programmatic hooks for what JSON cannot say.

Several input recipes can feed one output; a run processes them one after another.

| Package | What it is |
|---|---|
| [`@open.craw/core`](./packages/core) | The engine: recipe contracts and validation, the step walk, both runners, mapping, sinks. |
| [`@open.craw/cli`](./packages/cli) | `open-craw validate` / `run` / `probe` — inspect a site, check a recipe, run a crawl from the terminal. |
| [`@open.craw/mcp`](./packages/mcp) | The same probe/validate/run/list primitives as an MCP server, for an agent instead of a terminal. |

## Quick start

```sh
npm install @open.craw/core
npx playwright install chromium     # only for web recipes and browser bootstraps
```

Or from the terminal, with [`@open.craw/cli`](./packages/cli):

```sh
npm install -g @open.craw/cli
open-craw probe https://example.com/product/1      # find where a site's data lives
open-craw validate recipes/                        # check a recipe binds before running it
open-craw run recipes/ --out out/products.jsonl
```

```ts
import { createCrawler, jsonLinesSink, loadRecipeSet } from '@open.craw/core'

const recipes = await loadRecipeSet({ output: 'recipes/product.output.json', inputs: ['recipes/'] })
const crawler = createCrawler({ sink: jsonLinesSink('out/products.jsonl') })
const report = await crawler.run(recipes)
await crawler.close()
```

Start from [`examples/recipes`](./examples/recipes) and the guide in [`docs/recipes/authoring.md`](./docs/recipes/authoring.md).
The specification is [`docs/requirements.md`](./docs/requirements.md).

## Working on this repository

An Nx monorepo generated with [`@mnci/cli`](https://www.npmjs.com/package/@mnci/cli); every package is added
with `mnci add`. Code is organised in vertical feature slices, enforced by lint: see
[`docs/architecture/vertical-feature-slices.md`](./docs/architecture/vertical-feature-slices.md).

```sh
npm install
npm run affected            # lint, typecheck, test, build for what changed (what CI runs)
npm run core:qa             # lint + unit tests of @open.craw/core
npm run playwright:install  # once, for the browser tests
npm run core:e2e            # browser + HTTP end-to-end suite against a local fixture shop
npm run core:schemas        # regenerate packages/core/schemas from the zod contracts
npm run format              # eslint --fix; the linter is the formatter
```

Commits follow Conventional Commits (enforced by commitlint); `nx release` versions and publishes
`packages/*` from them on every push to `main`.
