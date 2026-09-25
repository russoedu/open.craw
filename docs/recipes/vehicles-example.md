# Worked example: vehicle configurations

Goal: for one model per manufacturer, every version and every priced configuration, with make, model,
version, trim, price, engine, fuel, doors, boot volume and available colours. Sources: BYD UK and Kia UK
(Peugeot UK was asked for; its Akamai edge blocks the network the recipes were tested from, browser
included, so Kia stands in). Recipes under `examples/vehicles/`.

## Finding the data before writing anything

This is the part that decides everything. Both sites are script-heavy configurators; neither renders the
price list into plain HTML the way TMDB renders a credits table.

**BYD UK.** The configurator (`/uk/configurator/seal`) is a Vue app. Its HTML has no vehicle data, but
the component's configuration JSON is inlined in the page and contains
`"carPath":"https://cms-api.byd.com/car/byd/uk/CX009018.json"`. That one file is the whole configurator:
a list of versions, each with `productNameAlias` (the trim), `formattedPrice`, `salesTopic` (the marketing
bullets), `specification.colors.list` (the six colour names) and `skuList`, an object keyed by
`colour$interior$wheel` codes with one priced SKU per combination. The technical fields BYD models
(`peakPower`, `cargo`, `batteryType`, `driveType`) are all empty for the UK, so motor, boot and doors are
not available from BYD's data. Power and drive appear only as bullets on some versions
(`● 530 PS (390 kW)`, `● All Wheel Drive`).

**Kia UK.** Server-rendered pages, three of them per model. `/pricing/` has a table with one row per
version: `'Air SR' 58.3kWh 201bhp 1-Speed Auto (FWD)`, drivetrain, then the money columns with the OTR
price in the twelfth cell. `/specification/` has section tables; boot volume is a row labelled "Luggage
compartment capacity, seats upright, litres" and the motor a row labelled "Electric Engine". The model page
carries a `data-vrdata` attribute per trim holding JSON with the trim name and its colours. Doors are on
none of the three pages.

Consequence for the output: `doors` and `bootVolumeLitres` are `nullable`, `engine` is `nullable`, and the
recipe `description` says why.

## What the engine had to learn

- A **`regex` extract kind**: `carPath` sits inside an inline script, Kia's boot volume sits in table text
  after a label. Neither is an element or a JSON path. `regex` runs on the document as text (or on a bound
  text, or a list of texts) and takes group 1.
- **Selectors are templates**: a JSONPath such as `$[?(@.trimname=='{{trim_base}}')]` adapts to the
  current row. Kia's colours were first joined that way; they now use the `lookup` transform, which says
  what it does (`in colour_data, key trimname, pick colors`) instead of hiding a join in a filter string.
- A transform failure under a rule marked `onMissing: "skip-record"` now drops the record instead of
  stopping the recipe (a table's header row has "OTR £" where the price should be).
- The `replace` transform lost `$1` backreferences in a lint-driven rewrite; the Kia version string
  exposed it. Fixed, with a test.

## The BYD route

```text
request  configurator  https://www.byd.com/uk/configurator/seal
extract  car_path      regex "carPath":"(https://cms-api\.byd\.com/[^"]+\.json)"
request  car           {{car_path}}                                  the whole configurator as JSON
set      make          BYD
set      fuel          Electric
extract  versions      from car  $[*]                                 2 versions
forEach  versions as version                                          (not emitting)
  extract topics       from version  $.salesTopic[*]                  the bullets
  extract power        from topics  regex (\d+ PS \(\d+ kW\))         onError: skip
  extract drive        from topics  regex ((?:Rear|Front|All) Wheel Drive)   onError: skip
  extract colour_names from version  $.specification.colors.list[*].name
  extract skus         from version  $.skuList.*                      12 combinations
  forEach skus as sku, emit                                           one record per combination
mapping  trim: version.productNameAlias.val
         configuration: template "{{sku.colors.name}} / {{sku.interior.name}} interior / {{sku.wheels.name}} wheels"
         price: sku.formattedPrice -> currency GBP
         engine: [power, drive] -> coalesce
         colours: colour_names
```

Two nested `forEach`: the outer binds `version` and computes the per-version values once, the inner emits
per SKU. Only the inner emits, so the binding validator accepts it. Every record sees `version` and `sku`
because `emit` snapshots the scope chain.

The first run produced 12 records instead of 24: `trim` was not a key, and Excellence's SKUs have the same
colour / interior / wheel combinations as Design's, so they were dropped as duplicates. Keys must include
everything that distinguishes a record; the report's `duplicates` count is the tell.

## The Kia route

```text
set      make, fuel
request  spec_page     /specification/
extract  boot          regex Luggage compartment capacity, seats upright, litres</td>\s*<td[^>]*>\s*([0-9,]+)
extract  motor         regex Electric Engine</td>\s*<td[^>]*>\s*([^<]+?)\s*</td>
request  model_page    /
extract  model_name    regex "name":"([^"]+)","position":3          the breadcrumb
extract  colour_data   css [data-vrdata], attr:data-vrdata, many     JSON texts, one per trim
request  pricing       /pricing/
extract  rows          css div.tableWrap table tr:not(:first-child), take html, many
forEach  rows as row, emit
  extract label        from row  td:first-child                       "'Air SR' 58.3kWh 201bhp 1-Speed Auto (FWD)"
  extract trim         from label  regex ^'([^']+)'                   onError: skip
  extract trim_base    from label  regex ^'(GT-Line S|GT-Line|Air)    the colour set to use
  extract drivetrain   from row  td:nth-child(2)
  extract otr          from row  td:nth-child(12)                     onError: skip
mapping  version: label with the quotes removed ($1)    price: otr -> currency GBP, onMissing skip-record
         engine: template "{{motor}}, {{label}}" minus the quoted trim    bootVolumeLitres: boot -> integer
         colours: trim_base -> lookup in colour_data by trimname, pick colors -> jsonpath $[*].displayName
```

The three pages are fetched in the order that lets later steps reuse earlier ids: specification and
colours once, then the pricing rows. The pricing table has a trailing row without a price cell; `otr`
skips, the price rule rejects that record, and the recipe carries on.

## Result

```text
BYD SEAL | Design     | £46,830 | Indigo Grey / Tahiti Blue interior / 19 inch wheels | Rear Wheel Drive | boot - | 6 colours
BYD SEAL | Design     | £45,730 | Atlantis Blue / Tahiti Blue interior / 19 inch wheels | Rear Wheel Drive | boot - | 6 colours
BYD SEAL | Design     | £46,830 | Obsidian Black / Black interior / 19 inch wheels | Rear Wheel Drive | boot - | 6 colours
  ... 21 more BYD combinations ...
BYD SEAL | Excellence | £49,830 | Ruby Red / Tahiti Blue interior / 19 inch wheels | 530 PS (390 kW) | boot - | 6 colours
Kia EV3 | Air SR     | £33,055 | Air SR 58.3kWh 201bhp 1-Speed Auto (FWD) | Permanent Magnet Synchorous Motor (PMSM), 58.3kWh 201bhp 1-Speed Auto (FWD) | boot 460 | 5 colours
Kia EV3 | Air        | £36,055 | Air 81.4kWh 201bhp 1-Speed Auto (FWD) | Permanent Magnet Synchorous Motor (PMSM), 81.4kWh 201bhp 1-Speed Auto (FWD) | boot 460 | 5 colours
Kia EV3 | GT-Line    | £39,455 | GT-Line 81.4kWh 201bhp 1-Speed Auto (FWD) | Permanent Magnet Synchorous Motor (PMSM), 81.4kWh 201bhp 1-Speed Auto (FWD) | boot 460 | 5 colours
Kia EV3 | GT-Line S  | £43,055 | GT-Line S 81.4kWh 201bhp 1-Speed Auto (FWD) | Permanent Magnet Synchorous Motor (PMSM), 81.4kWh 201bhp 1-Speed Auto (FWD) | boot 460 | 5 colours
Kia EV3 | GT-Line S  | £43,955 | GT-Line S 81.4kWh 201bhp Heat Pump 1-Speed Auto (FWD) | Permanent Magnet Synchorous Motor (PMSM), 81.4kWh 201bhp Heat Pump 1-Speed Auto (FWD) | boot 460 | 5 colours

29 records written to /home/user/open.craw/examples/vehicles/out/vehicles.jsonl
  byd-uk: 24 emitted, 0 rejected, 2 pages, 2424 ms
  kia-uk: 5 emitted, 2 rejected, 3 pages, 3219 ms
```

## The trace (BYD, first records)

```text
▶ byd-uk (api)
  ⇢ page 1  https://www.byd.com/uk/configurator/seal
  · steps.0  request configurator  1417 ms
  · steps.1  extract car_path  0 ms
  ⇢ page 1  https://cms-api.byd.com/car/byd/uk/CX009018.json
  · steps.2  request car  1092 ms
  · steps.3  set make  1 ms
  · steps.4  set fuel  0 ms
  · steps.5  extract versions  1 ms
    · steps.6.steps.0  extract topics  1 ms
    ↷ steps.6.steps.1  extract power  skipped: no match for (\d+ PS \(\d+ kW\))
    · steps.6.steps.2  extract drive  0 ms
    · steps.6.steps.3  extract colour_names  1 ms
    · steps.6.steps.4  extract skus  0 ms
  ✚ record ["BYD","SEAL","BYD SEAL 2026","Design","Indigo Grey / Tahiti Blue interior / 19 inch wheels"]
  ✚ record ["BYD","SEAL","BYD SEAL 2026","Design","Atlantis Blue / Tahiti Blue interior / 19 inch wheels"]
  ✚ record ["BYD","SEAL","BYD SEAL 2026","Design","Obsidian Black / Black interior / 19 inch wheels"]
  ...
■ byd-uk: 24 emitted, 0 rejected, 0 duplicates, 2 pages, 2555 ms
```
