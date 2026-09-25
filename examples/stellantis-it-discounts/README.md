# Monthly discount sheets from PDFs: Stellantis Italy

Stellantis Italy publishes a monthly sheet of discounts for members of Italian professional associations
("accordi quadro nazionali"), republished by ENPAM as a PDF per month. Each sheet holds one table per brand:
Fiat, Abarth, Lancia, Alfa Romeo, Jeep, Fiat Professional (online and offline), Peugeot, Citroen, DS, Opel.
Every row is a model with its percentage off list price, the versions it excludes and any extra incentive
(trade-in, scrappage, stock or registration bonus).

| File | What |
|---|---|
| `dealer-discount.output.json` | `month`, `brand`, `channel` (online / offline, when a brand's table splits by it), `model`, `discountPercent`, `excludedVersions`, `extraIncentive`, plus the generated `sheet` URL. Key: month + brand + channel + model. |
| `stellantis-it.input.json` | Fetches each month's PDF (`request` with `as: "pdf"`), reads every table whose header row starts with `MODELLI` (`extract` with `kind: "table"`), and emits one record per row. |

```sh
npm run cli:build   # or: npx nx run-many -t build
OPENCRAW_INSECURE_TLS=1 node packages/cli/bin/opencraw.mjs run examples/stellantis-it-discounts --out out/discounts.jsonl
```

January to September 2026 (no March was published) give 1,059 records:

```json
{"month":"2026-09","brand":"FIAT","channel":null,"model":"PANDA (modello 319-390)","discountPercent":22,"excludedVersions":null,"extraIncentive":"+2% premio targa"}
{"month":"2026-09","brand":"ALFA ROMEO","channel":null,"model":"620 - Giulia","discountPercent":18,"excludedVersions":"Quadrifoglio Super Sport 620.LRU e QV Ultima 620.XRU","extraIncentive":"5% PREMIO LOYALTY / PERMUTA ROTTAMAZIONE (solo con P/R di vetture Alfa Romeo) cumula solo con il tan 4,75%"}
{"month":"2026-09","brand":"DS","channel":null,"model":"DS 3 MHEV","discountPercent":7,"excludedVersions":null,"extraIncentive":"+ Eu 800 permuta/rottamazione (non disponibile su on - line) _ Eu 1500 stock con immatricolazioni entro 30/09/26"}
```

What these sheets do to a table, and how the recipe copes:

- **Cells wrapped over several lines.** A long model name wraps over up to five lines with its values centred
  beside it; excluded versions wrap above and below their row; notes run over two lines, bottom-aligned. The
  table extractor regroups the lines into rows (`align: "auto"` infers which way).
- **Headers centred over left-aligned columns, columns that move.** The discount column sits at x≈218 on the
  Fiat page and x≈283 on the Peugeot page. Columns come from where the body's cells start, mapped to headers in
  order.
- **A header that differs.** Fiat Professional's offline table calls its discount column "(PROMO VALIDA SOLO IN
  CONCESSIONARIA off-line)", hence `"discount": "^(Sconto|\\(PROMO)"`.
- **Footnotes.** `until` stops each table at "NOTA BENE", "N.B." or the page's "*Si applicano…" footnote.
- **A month that breaks the template.** June 2026 was published with only its van and promo-code pages. The
  recipe's first extract (`fiat_table`, `onError: skip`) finds no Fiat table, so June yields no records and the
  run's summary says `1 steps skipped`, with the reason in `--trace`.

`opencraw probe <a sheet's URL>` lists every table header of a PDF with a ready selector: that is how this
recipe's selectors were found.
