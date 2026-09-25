# Movies from Netflix and IMDb

One output, two sources, five records each. The point is to see the recipe model hold up on real sites.

| File | What it does |
|---|---|
| `movie.output.json` | `title`, `genres`, `actors`, plus generated `source`, `url`, `scrapedAt`. `title` + `source` is the key. |
| `netflix-movies.input.json` | **api mode.** Netflix's public "Movies" genre page carries a JSON-LD `ItemList` of titles; each title page carries JSON-LD with `name`, `genre` and `actors`. No browser, no login. |
| `imdb-top.input.json` | **web mode.** The Top 250 chart in a real browser, then each title page's JSON-LD (`name`, `genre`, `actor`). IMDb is behind AWS WAF: a plain HTTP client gets a "Human Verification" challenge, and so does any browser from a flagged IP (cloud sandboxes). From a normal machine it works. |

```sh
npm run core:build
node examples/movies/run.mjs                  # both
node examples/movies/run.mjs --only netflix   # no browser needed
node examples/movies/run.mjs --only imdb      # needs `npm run playwright:install`
```

Records land in `examples/movies/out/movies.jsonl` (one JSON object per line, `_source` attached). Change
`limits.maxRecords` in an input recipe to crawl more.

What the recipes lean on, in case a site changes:

- Both sites publish structured data as `<script type="application/ld+json">`. The recipes extract every
  such block as text (`many: true`) and read it with `jsonpath` extracts, which parse the text and search all
  blocks at once (`$[*].actors[*].name`).
- Netflix's `genre` is one string; the output's `array` field wraps it. IMDb's is already an array.
- IMDb entity-escapes apostrophes inside its JSON-LD (`&apos;`); the mapping replaces them.
