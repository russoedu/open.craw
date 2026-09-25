# @opencraw/mcp

An MCP (Model Context Protocol) server exposing [`@opencraw/core`](../core) as tools an agent can call
directly: probe a page, validate recipes, run a crawl, list what's already authored. Local transport only
(stdio) — the host launches it as a subprocess, the same shape as the [`opencraw` cli](../cli).

This does **not** auto-author recipes from a sentence. The four tools are the same primitives the
`opencraw` cli gives a terminal; the calling agent still writes the JSON recipes, using `probe` and
`validate` to iterate, the same way this project's own example recipes were built by hand. An agent that
can write files passes their `paths`; one that can't (a chat-only host) passes the `recipes` inline.

## Register it

```json
{
  "mcpServers": {
    "opencraw": {
      "command": "node",
      "args": ["/absolute/path/to/opencraw/packages/mcp/bin/opencraw-mcp.mjs"],
      "env": { "OPENCRAW_CHROMIUM": "/path/to/chrome" }
    }
  }
}
```

`OPENCRAW_CHROMIUM` and `OPENCRAW_INSECURE_TLS=1` in the server's environment are the defaults for every
`probe`/`run` call's `browserPath`/`insecureTls`, so a sandbox without Playwright's own bundled browser
does not need every tool call to repeat them.

`OPENCRAW_HOOKS` points at a JavaScript module whose default export is `{ name: function }`: the hooks the
recipes call (`hook` steps and transforms). Only the server's environment names it, never a tool call, so an
agent can run recipes that use your hooks but can't make the server load a module of its choosing.

`OPENCRAW_ACCESS` points at an access config ([access.md](../../docs/recipes/access.md)): proxy profiles, with
credentials as `{{env.NAME}}` read from the server's environment. The `probe` and `run` tools then take an
`access` argument naming a profile. The file and the credentials never pass through a tool call.

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
| `access?` | An access profile from the server's `OPENCRAW_ACCESS` config. |

Returns `{ url, status, findings: { jsonLd, inlineJson, jsonUrls, scriptHosts, apiLinks }, observed }`. For a
PDF (served as `application/pdf`, or a local path) it adds `pdf: { pages, rows, headers }`: the first rows and
every likely table header with the `selector` a `table` extract needs.

### `validate`

Loads and binds recipes (an output recipe plus its input recipes), from files or passed inline: parses each
against its schema, checks every mapping resolves, reports every problem with its JSON path.

| Input | Meaning |
|---|---|
| `paths` | Recipe files (`.json`, `.jsonl`) or directories of them. |
| `recipes` | Instead of `paths`: the recipes themselves, as an array of recipe objects or as JSON / JSON Lines text. For a host that can't write files. An inline recipe's issues name it by position: `recipes[1]`, or `recipes:2` for a line. |

Give exactly one of `paths` and `recipes`.

Returns `{ ok, output?, inputs: string[], issues: [{ path, message, source }] }`.

### `run`

Crawls the recipes at the given paths, or passed inline.

| Input | Meaning |
|---|---|
| `paths` or `recipes` | As in `validate`: exactly one output recipe, any number of input recipes. |
| `out?` | Write records to this JSON Lines file instead of returning them inline. Use this for anything beyond a handful of records — the tool result is not the place for a large crawl's output. |
| `append?`, `resume?` | As in the cli (`resume` needs `append`). |
| `only?` | Run only these input recipe ids. |
| `dryRun?` | One record per input recipe instead of a full crawl — for checking a recipe under construction. |
| `headed?`, `browserPath?`, `insecureTls?`, `userAgent?` | As in the cli. |
| `access?` | The access profile for recipes that name none, from the server's `OPENCRAW_ACCESS` config. |

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

`nx build @opencraw/mcp`, `nx test @opencraw/mcp` (unit tests per tool), `nx run @opencraw/mcp:e2e`
(spawns the built server and drives it with the MCP SDK's own `Client`/`StdioClientTransport`, against the
fixture shop `@opencraw/core` ships; needs a browser — `npm run playwright:install` once, or
`OPENCRAW_CHROMIUM=/path/to/chrome`).
