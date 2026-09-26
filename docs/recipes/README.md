# Recipe documentation

| Document | Read it when |
|---|---|
| [authoring.md](./authoring.md) | You are writing a recipe and need every field, step, transform and rule, with the reasoning behind each. The reference. |
| [quick-guide.md](./quick-guide.md) | You want the short version: one page, the common shapes. |
| [movies-example.md](./movies-example.md) | You want to see real recipes end to end: five movies from Netflix and IMDb, then movie → lead actor → filmography on TMDB and Letterboxd, with the decisions, the traces and the bugs met on the way. |
| [vehicles-example.md](./vehicles-example.md) | You want the harder case: configurator data behind an inline `carPath`, three pages per model, nested loops emitting one record per priced combination, and the two engine features it forced (`regex` extracts, templated selectors). |
| [access.md](./access.md) | A site blocks the network you crawl from: proxies, provider presets, where credentials go, and the plugin seam. |
| [captcha.md](./captcha.md) | A site shows a captcha: whether to solve it, the three places a challenge appears, the solve loop, the budget, and writing a solver. |
| [../requirements.md](../requirements.md) | You need the specification the engine is checked against. |

The JSON Schemas for editor validation are in `packages/core/schemas/`; point a recipe's (or an access config's) `$schema` at them.
