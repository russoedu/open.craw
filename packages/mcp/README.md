# @open.craw/mcp

An MCP (Model Context Protocol) server exposing [`@open.craw/core`](../core) as tools an agent can call
directly: probe a page, validate recipes, run a crawl, list what's already authored. Local transport only
(stdio) — the host launches it as a subprocess, the same shape as the [`open-craw` cli](../cli).

This does **not** auto-author recipes from a sentence. The four tools are the same primitives the
`open-craw` cli gives a terminal; the calling agent still writes the JSON recipes, using `probe` and
`validate` to iterate, the same way this project's own example recipes were built by hand.

## Register it

```json
{
  "mcpServers": {
    "open-craw": {
      "command": "node",
      "args": ["/absolute/path/to/open.craw/packages/mcp/bin/open-craw-mcp.mjs"],
      "env": { "OPEN_CRAW_CHROMIUM": "/path/to/chrome" }
    }
  }
}
```

`OPEN_CRAW_CHROMIUM` and `OPEN_CRAW_INSECURE_TLS=1` in the server's environment are the defaults for every
`probe`/`run` call's `browserPath`/`insecureTls`, so a sandbox without Playwright's own bundled browser
does not need every tool call to repeat them.

## Tools

### `probe`

Fetches a page and reports where its data lives: JSON-LD blocks, inline JSON objects above a size with
their keys, `.json` URLs referenced in the markup, script hosts, and links that look like an API. With
`browser: true` it also renders the page and lists the JSON responses observed while it settles, for
endpoints only a script fetches after load.

| Input | Meaning |
|---|---|
| `url` | The page to fetch. |
| `browser?` | Also render it in a browser (slower, a few seconds). |
| `browserPath?`, `insecureTls?`, `userAgent?` | As in the cli. |

Returns `{ url, status, findings: { jsonLd, inlineJson, jsonUrls, scriptHosts, apiLinks }, observed }`.

### `validate`

Loads and binds recipe files (an output recipe plus its input recipes): parses each against its schema,
checks every mapping resolves, reports every problem with its JSON path.

| Input | Meaning |
|---|---|
| `paths` | Recipe files or directories. |

Returns `{ ok, output?, inputs: string[], issues: [{ path, message, source }] }`.

### `run`

Crawls the recipes at the given paths.

| Input | Meaning |
|---|---|
| `paths` | Recipe files or directories: exactly one output recipe, any number of input recipes. |
| `out?` | Write records to this JSON Lines file instead of returning them inline. Use this for anything beyond a handful of records — the tool result is not the place for a large crawl's output. |
| `append?`, `resume?` | As in the cli (`resume` needs `append`). |
| `only?` | Run only these input recipe ids. |
| `dryRun?` | One record per input recipe instead of a full crawl — for checking a recipe under construction. |
| `headed?`, `browserPath?`, `insecureTls?`, `userAgent?` | As in the cli. |

Returns `{ report: CrawlReport, records?, truncated? }`. `records`/`truncated` are present only when `out`
was not given, and `records` is capped at 50 even then.

### `list_recipes`

Lists the recipe files in a directory, split by kind, with their ids — cheaper than a full `validate`
call, for checking what already exists before writing a new recipe.

| Input | Meaning |
|---|---|
| `dir` | A directory of recipe files. |

Returns `{ outputs: [{ path, id }], inputs: [{ path, id, output, mode }], others: string[] }`.

## Building

`nx build @open.craw/mcp`, `nx test @open.craw/mcp` (unit tests per tool), `nx run @open.craw/mcp:e2e`
(spawns the built server and drives it with the MCP SDK's own `Client`/`StdioClientTransport`, against the
fixture shop `@open.craw/core` ships; needs a browser — `npm run playwright:install` once, or
`OPEN_CRAW_CHROMIUM=/path/to/chrome`).
