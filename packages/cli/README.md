# @open.craw/cli

Command-line tools for [`@open.craw/core`](../core): probe a page for scrapable data, validate recipes,
and run a crawl from the terminal.

## Install

```sh
npm install -g @open.craw/cli
# or, inside this workspace: node packages/cli/bin/open-craw.mjs <command>
```

## Commands

```
open-craw validate <recipe files or directories...>
open-craw run <recipe files or directories...> [options]
open-craw probe <url> [options]
```

### `validate`

Loads every recipe file (or every `.json` file in a directory), parses it against its schema and binds
the input recipes to the output recipe, printing every problem with its JSON path. Exit code 1 if anything
fails.

```sh
open-craw validate recipes/
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

```sh
open-craw run recipes/ --out out/products.jsonl --trace
open-craw run recipes/movie.output.json recipes/tmdb.input.json --dry-run
```

### `probe`

Fetches a page and reports where its data lives: JSON-LD blocks, inline JSON objects, `.json` URLs
referenced in the markup, script hosts, and links that look like an API. With `--browser`, it also renders
the page in a browser and lists the JSON responses it observes while the page settles — useful for
endpoints only a script fetches after load.

```sh
open-craw probe https://example.com/product/1
open-craw probe https://example.com/configurator --browser
```

Use it before writing an input recipe, to find the shape a site's data actually takes (§9 of
[the authoring guide](../../docs/recipes/authoring.md)).

### Options common to `run` and `probe`

| Flag | Meaning |
|---|---|
| `--browser-path <path>` | A browser binary other than the one Playwright installed (or `OPEN_CRAW_CHROMIUM`). |
| `--insecure-tls` | Accept an intercepting proxy's certificate (or `OPEN_CRAW_INSECURE_TLS=1`). |
| `--access <file>` | An access config: proxy profiles, with credentials as `{{env.NAME}}` (or `OPEN_CRAW_ACCESS`). See [access.md](../../docs/recipes/access.md). |
| `--access-profile <name>` | The profile used by recipes that name none, overriding the config's `default`. `probe` uses it for its fetch. |
| `--user-agent <ua>` | The user agent to send. |

## Building

Run `nx build @open.craw/cli` to build this project, `nx test @open.craw/cli` for its unit tests, and
`nx run @open.craw/cli:e2e` for the spawn-driven suite against the fixture shop `@open.craw/core` ships
(needs a browser: `npm run playwright:install` once, or `OPEN_CRAW_CHROMIUM=/path/to/chrome`).
