# From a movie to its lead actor's films

A navigation test: the entry point is one movie (Heat, 1995), the recipe finds the lead actor, follows
the link to the actor's page and emits one record per film there. The two sites reach the same output by
different routes and markup.

| File | Route |
|---|---|
| `filmography.output.json` | `actor`, `title`, `year`, `role`, `entryMovie`, `filmUrl`, plus generated `source`, `url`, `scrapedAt`. Key: `actor` + `title` + `source`. |
| `tmdb-filmography.input.json` | Movie page JSON-LD gives the entry title; the "Top Billed Cast" scroller's first link is the lead actor; the person page's first credits table (Acting) is walked row by row: `td.year`, `td.role a bdi`, `span.character`. |
| `letterboxd-filmography.input.json` | Film page JSON-LD gives the entry title; `div.cast-list` first link is the lead actor; the "Films starring" poster grid is walked item by item, reading `data-item-name` ("The Godfather (1972)"), `data-item-link` and the `title` attribute ("... as Michael Corleone") for the role. |

```sh
npm run core:build
node examples/filmography/run.mjs                  # both, no browser needed
node examples/filmography/run.mjs --only tmdb
```

Ten films per source (`limits.maxRecords`). Records land in `examples/filmography/out/filmography.jsonl`.

What the recipes exercise in the engine:

- a `request` whose URL is a relative link (`/person/1158-al-pacino`, `/actor/al-pacino/`), resolved against
  the page it came from;
- `extract ... take: "html"` of a table or a grid, then a `forEach` over its rows or items with further
  `extract`s scoped to each fragment (`from: "row"`);
- transforms that split one attribute into two fields (`regex` for title and year from `"Name (1972)"`) and
  a missing-value policy for films without a year or a role (`nullable`).
