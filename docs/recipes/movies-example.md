# Worked example: movies

Two rounds of real recipes, kept under `examples/`, with the decisions behind them. Read
[authoring.md](./authoring.md) for what each key means; this page is about *why* the recipes look the way
they do and what happened when they ran.

## Round 1: five movies each from Netflix and IMDb (`examples/movies/`)

**Output** (`movie.output.json`): `title`, `genres` (array), `actors` (array), plus generated `source`,
`url`, `scrapedAt`. Key: `title` + `source`, so the same film from two sites stays two records.

### Netflix, api mode

Probing first: Netflix's public genre page `https://www.netflix.com/browse/genre/34399` ("Movies") is
served without login and contains one `<script type="application/ld+json">` holding an `ItemList` of 680
`{ "@type": "Movie", "name", "url": "https://www.netflix.com/title/<id>" }`. Each title page contains one
JSON-LD block with `name`, `genre` (a single string) and `actors[].name`. No browser needed.

The route, as ids:

```text
request  listing     {{start.url}}                                   the genre page
extract  listing_ld  script[type="application/ld+json"], many        JSON texts
extract  items       from listing_ld  $[*].itemListElement[*].item   680 { name, url }
forEach  items as item, emit
  request detail     {{item.url}}
  extract detail_ld  script[...ld+json], many
  extract name       from detail_ld  $[*].name
  extract genre      from detail_ld  $[*].genre        onError: skip
  extract actors     from detail_ld  $[*].actors[*].name, many
```

Decisions:

- `limits.maxRecords: 5` stops the `forEach` after five records; the other 675 items are never fetched.
- `delayMs: 1000` between requests: politeness costs nothing at this size.
- `genre` is a string on Netflix; the output field is an `array`, and coercion wraps a scalar. Same output
  as IMDb's array without a transform.
- `genre` has `onError: skip` because a title page without a genre is plausible; `name` and `actors` do not,
  so a markup change fails loudly instead of producing empty records.

Result, verified:

```text
netflix  | The Ministry of Ungentlemanly Warfare | Comedies | Henry Cavill, Eiza González, Alan Ritchson, Alex Pettyfer
netflix  | Puss in Boots: The Last Wish          | Comedies | Antonio Banderas, Salma Hayek Pinault, Harvey Guillén, Florence Pugh
netflix  | The Hitman's Bodyguard                | Comedies | Ryan Reynolds, Samuel L. Jackson, Gary Oldman, Salma Hayek
netflix  | National Security                     | Comedies | Martin Lawrence, Steve Zahn, Colm Feore, Bill Duke
netflix  | Ride Along 2                          | Comedies | Ice Cube, Kevin Hart, Tika Sumpter, Benjamin Bratt
  netflix: 5 emitted, 0 rejected, 6 pages, 11342 ms
```

### IMDb, web mode

Every request to IMDb from the sandbox, with a real browser included, answered `202` with
`x-amzn-waf-action: challenge` and a "Human Verification" page: AWS WAF flags the egress IP. Nothing in a
recipe fixes that, so the recipe is written for a normal machine: `goto` the Top 250 chart, `wait` for
`a.ipc-title-link-wrapper`, extract every `href`, then per link `goto` the title page and read its JSON-LD
(`$[*].name`, `$[*].genre`, `$[*].actor[*].name`). IMDb entity-escapes apostrophes inside JSON-LD, so the
title mapping carries `replace &apos; → '`. When the engine cannot pass the wall it reports the recipe as
stopped at `steps.1 (wait)` and moves on; the run does not crash.

### What Round 1 changed in the engine

Both sites put their data in JSON-LD *text*. A `jsonpath` extract now parses text, and a list of texts
(every JSON-LD block, extracted with `many`) becomes an array of the entries that parse, so
`$[*].actors[*].name` finds the right block wherever it sits.

## Round 2: movie → lead actor → filmography (`examples/filmography/`)

The test was navigation: one movie as the entry point, find its lead actor, follow the link, one record per
film on the actor's page, on two sites that reach it differently.

Netflix could not be the second site: its search and person pages redirect to login. TMDB and Letterboxd are
public, server-rendered, and link movie → actor → films. Both recipes run in `api` mode.

**Output** (`filmography.output.json`): `actor`, `title`, `year` (nullable integer), `role` (nullable),
`entryMovie`, `filmUrl`, plus generated `source`, `url`, `scrapedAt`. Key: `actor` + `title` + `source`.

### TMDB: walk table rows

```text
request  entry         https://www.themoviedb.org/movie/949-heat
extract  entry_ld      script[ld+json], many
extract  entry_title   from entry_ld  $[?(@['@type']=='Movie')].name        "Heat"
extract  actor_name    ol.people.scroller li.card p a                       "Al Pacino"  (first = top billed)
extract  actor_href    same, attr:href                                      "/person/1158-al-pacino"
request  actor_page    {{actor_href}}                                       relative, resolved against the movie page
extract  acting_table  table.card.credits, take html                        the first credits table = Acting
extract  rows          from acting_table  table.credit_group tr, many       one <tr> fragment per film
forEach  rows as row, emit
  extract title        from row  td.role a bdi
  extract film_href    from row  td.role a, attr:href
  extract year         from row  td.year          onError: skip
  extract role         from row  span.character   onError: skip
mapping  year: regex (\d{4}) → integer       "2026" → 2026, "—" → no match → null
         filmUrl: absoluteUrl                  resolved against the actor page
```

TMDB lists newest first, so the top rows are unreleased films with `—` for the year. The `regex` finds no
digits, the value is missing, the field is `nullable`, the record gets `null`. No policy on `title`: a row
without a title link means the markup changed.

### Letterboxd: walk grid items

```text
request  entry        https://letterboxd.com/film/heat-1995/
extract  entry_title  from entry_ld  $[?(@['@type']=='Movie')].name
extract  actor_name   div.cast-list a.text-slug                              "Al Pacino"
extract  actor_href   same, attr:href                                        "/actor/al-pacino/"
request  actor_page   {{actor_href}}
extract  items        ul.grid li.griditem, take json (outer HTML), many
forEach  items as item, emit
  extract name        from item  div.react-component, attr:data-item-name     "The Godfather (1972)"
  extract link        from item  div.react-component, attr:data-item-link     "/film/the-godfather/"
  extract caption     from item  li.griditem, attr:title                      "The Godfather (1972) as Michael Corleone"
mapping  title: regex ^(.*?)(?: \(\d{4}\))?$    year: regex \((\d{4})\)$ → integer    role: regex  as (.+)$
```

Same output, different arithmetic: one attribute feeds two fields, and the role lives in the list item's
own `title` attribute, which is why the items are taken as outer HTML (`take: json`) and re-selected with
`li.griditem`.

### Result, verified

```text
tmdb       | Al Pacino | ---- | St. Vincent                      |
tmdb       | Al Pacino | ---- | Lear Rex                         | King Lear
tmdb       | Al Pacino | 2026 | Maserati: The Brothers           | Vincenzo Vaccaro
tmdb       | Al Pacino | 2026 | In the Hand of Dante             | Uncle Carmine
letterboxd | Al Pacino | 1972 | The Godfather                    | Michael Corleone
letterboxd | Al Pacino | 1983 | Scarface                         | Tony Montana
letterboxd | Al Pacino | 1995 | Heat                             | Lt. Vincent Hanna
letterboxd | Al Pacino | 2019 | The Irishman                     | Jimmy Hoffa
  tmdb: 10 emitted, 0 rejected, 2 pages, 3006 ms
  letterboxd: 10 emitted, 0 rejected, 2 pages, 2788 ms
```

### The bug worth remembering

The first TMDB run printed `St. Vincent | King Lear`. TMDB nests tables: `table.card.credits > tr > td >
table.credit_group > tr`. The selector `tr` matched the outer wrapper row first, whose inner HTML holds every
credit; "first `bdi`" gave St. Vincent and "first `span.character`" gave the *next* film's role. The real
St. Vincent row was then dropped as a duplicate key. No error anywhere: a shifted field. The selector is
`table.credit_group tr` now. Rule: on nested markup, select the innermost repeating element and check the
first record by hand.

### What Round 2 changed in the engine

- A `request` with a relative URL resolves against the current page, like a link.
- CSS on an extracted fragment (`<tr>`, `<li>`) is parsed in fragment mode; the document parser was
  dropping table cells outside a table.
- JSON-LD wrapped in `/* <![CDATA[ */` or `<!-- -->` guards is unwrapped before parsing.

## The trace

`node examples/filmography/run.mjs --only tmdb --trace` prints the route the engine took:

```text
▶ tmdb (api)
  ⇢ page 1  https://www.themoviedb.org/movie/949-heat
  · steps.0  request entry  1561 ms
  · steps.1  extract entry_ld  54 ms
  · steps.2  extract entry_title  3 ms
  · steps.3  extract actor_name  31 ms
  · steps.4  extract actor_href  13 ms
  ⇢ page 1  https://www.themoviedb.org/person/1158-al-pacino
  · steps.5  request actor_page  1317 ms
  · steps.6  extract acting_table  38 ms
  · steps.7  extract rows  22 ms
    · steps.8.steps.0  extract title  1 ms
    · steps.8.steps.1  extract film_href  0 ms
    · steps.8.steps.2  extract year  1 ms
    ↷ steps.8.steps.3  extract role  skipped: no match for span.character
  ✚ record ["Al Pacino","St. Vincent","tmdb"]
    · steps.8.steps.0  extract title  1 ms
    · steps.8.steps.1  extract film_href  0 ms
  ...
■ tmdb: 10 emitted, 0 rejected, 0 duplicates, 2 pages, 3082 ms
```

Read it as the step tree: one indent level per nested `steps`, `⇢` a page fetched, `·` a step done with its
id and duration, `↷` a skip policy that fired, `✚` a record with its key, `■` the recipe summary.
