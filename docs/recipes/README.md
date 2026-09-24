# Recipe documentation

| Document | Read it when |
|---|---|
| [authoring.md](./authoring.md) | You are writing a recipe and need every field, step, transform and rule, with the reasoning behind each. The reference. |
| [quick-guide.md](./quick-guide.md) | You want the short version: one page, the common shapes. |
| [movies-example.md](./movies-example.md) | You want to see real recipes end to end: five movies from Netflix and IMDb, then movie → lead actor → filmography on TMDB and Letterboxd, with the decisions, the traces and the bugs met on the way. |
| [../requirements.md](../requirements.md) | You need the specification the engine is checked against. |

The JSON Schemas for editor validation are in `packages/core/schemas/`; point a recipe's `$schema` at them.
