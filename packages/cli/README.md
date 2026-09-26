# @opencraw/cli

Command-line tools for [`@opencraw/core`](../core): probe a page for scrapable data, validate recipes,
and run a crawl from the terminal.

## Install

```sh
npm install -g @opencraw/cli
# or, inside this workspace: node packages/cli/bin/opencraw.mjs <command>
```

## Commands

```
opencraw validate <recipe files or directories...>
opencraw run <recipe files or directories...> [options]
opencraw probe <url> [options]
```

### `validate`

Loads every recipe file (or every `.json` and `.jsonl` file in a directory; a `.jsonl` file holds one
recipe per line), parses it against its schema and binds
the input recipes to the output recipe, printing every problem with its JSON path. Exit code 1 if anything
fails.

```sh
opencraw validate recipes/
```

### `run`

Crawls the recipes at the given paths (files or directories; exactly one output recipe, any number of
input recipes) and reports what happened.

| Flag | Meaning |
|---|---|
| `--out <file>` | Write records to this JSON Lines file. Without it, records print to stdout as JSON Lines. |
| `--append` | Keep what `--out` holds and add to it; each line carries `_key`. |
| `--resume` | Skip records `--out` already has (needs `--append`). |
| `--only <id>` | Run only this input recipe; repeat for more than one. |
| `--dry-run` | One record per input recipe, printed with the scope it was mapped from — for checking a recipe under construction without a full run. |
| `--trace` | Print the crawl trace to stderr. |
| `--headed` | Show the browser instead of running headless. |
| `--parallel <n>` | Run this many input recipes at once (default 1). Iterations inside a recipe follow its `limits.concurrency`. See [§3.9 of the authoring guide](../../docs/recipes/authoring.md#39-concurrency). |
| `--retries <n>` | Tries per request that fails in passing (a dropped connection, a timeout, a 429, a 5xx), for recipes whose `limits.retry` says nothing. Default 3; `1` turns retrying off. See [§7 of the authoring guide](../../docs/recipes/authoring.md#7-policies-what-happens-when-something-is-missing-or-fails). |
| `--profiles <dir>` | Where the persistent browser profiles of `session.browserProfile` live (or `OPENCRAW_PROFILES`; default `.opencraw/profiles`). See [access.md](../../docs/recipes/access.md#persistent-browser-profiles). |
| `--host-delay <ms>`, `--host-concurrency <n>` | Per-site politeness across every recipe: at least `ms` between two requests to one site, at most `n` in flight. They override the access config's `throttle` defaults. See [access.md](../../docs/recipes/access.md#throttling-per-site). |
| `--plugins <file>` (or `--hooks`) | A plugins module: named exports `hooks` (the recipes' hook steps and transforms), `accessPlugins` (for `{ kind: "plugin" }` access profiles) and `captchaSolvers`. A module whose default export is `{ name: function }` is read as hooks alone. `OPENCRAW_PLUGINS` / `OPENCRAW_HOOKS` when not given; `probe` reads it too. It runs as your code; load only files you trust. See [§6 of the authoring guide](../../docs/recipes/authoring.md#6-hooks). |

```sh
opencraw run recipes/ --out out/products.jsonl --trace
opencraw run recipes/movie.output.json recipes/tmdb.input.json --dry-run
```

### `probe`

Fetches a page and reports where its data lives: JSON-LD blocks, inline JSON objects, `.json` URLs
referenced in the markup, script hosts, and links that look like an API. With `--browser`, it also renders
the page in a browser and lists the JSON responses it observes while the page settles — useful for
endpoints only a script fetches after load.

```sh
opencraw probe https://example.com/product/1
opencraw probe https://example.com/configurator --browser
```

A PDF, a spreadsheet, a CSV or a presentation (a URL served with its content type, or a local `.pdf`,
`.xlsx`, `.csv`, `.tsv` or `.pptx` path) is read instead: `probe` lists its pages, sheets or slides, its first
rows, and every row that looks like a table header, with the `selector` a `table` extract needs. For a CSV it
also names the encoding and the delimiter it detected; for a presentation, its charts and the slides whose
text boxes look like a table. JSON, JSON Lines and YAML show their structure instead, and every list of
records with the `jsonpath` that walks it. An HTML page also lists its tables' header rows, and Markdown
(a `.md` URL is read as Markdown even when served as `text/plain`) its sections and front matter keys.

```sh
opencraw probe https://example.com/price-list.pdf
opencraw probe ./sheets/september.pdf
opencraw probe ./exports/listino.csv
opencraw probe ./exports/incentivi.xlsx
opencraw probe ./decks/incentivi.pptx
```

Use it before writing an input recipe, to find the shape a site's data actually takes (§9 of
[the authoring guide](../../docs/recipes/authoring.md)).

### Options common to `run` and `probe`

| Flag | Meaning |
|---|---|
| `--browser-path <path>` | A browser binary other than the one Playwright installed (or `OPENCRAW_CHROMIUM`). |
| `--insecure-tls` | Accept an intercepting proxy's certificate (or `OPENCRAW_INSECURE_TLS=1`). |
| `--access <file>` | An access config: proxy profiles, with credentials as `{{env.NAME}}` (or `OPENCRAW_ACCESS`). See [access.md](../../docs/recipes/access.md). |
| `--access-profile <name>` | The profile used by recipes that name none, overriding the config's `default`. `probe` uses it for its fetch. |
| `--user-agent <ua>` | The user agent to send. |

## Building

Run `nx build @opencraw/cli` to build this project, `nx test @opencraw/cli` for its unit tests, and
`nx run @opencraw/cli:e2e` for the spawn-driven suite against the fixture shop `@opencraw/core` ships
(needs a browser: `npm run playwright:install` once, or `OPENCRAW_CHROMIUM=/path/to/chrome`).
