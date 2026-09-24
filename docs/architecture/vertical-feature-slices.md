# ADR: Vertical feature slices and file naming

- **Status:** Accepted
- **Date:** 2026-09-24
- **Scope:** every hand-authored TypeScript package under `packages/` (today: `@open.craw/core`)
- **Enforced by:** `@mnci/eslint-config`'s `verticalSlices` rules, switched on in the root `eslint.config.mjs`

## Decision

Each package is organised as **capability -> cohesive subfeature -> flat, role-suffixed files**.

- The **package is the capability** (`@open.craw/core` = "run a recipe-driven crawl").
- Every folder directly under `src/` is a **subfeature** ("slice"): one outcome, one `index.ts` that is its
  whole public API.
- A slice is **flat**. The only folder allowed inside one is `fixtures/`, which holds test data (HTML, JSON),
  never code.
- Every production file is `<kebab-name>.<role>.ts`; tests are `<basename>.test.ts` beside the file.
- Only `index.ts` lives at the root of `src/`.
- Code that is not part of the library (`e2e/`, `tools/`) sits **outside `src/`** and is not subject to the
  slice rules.

This combines Vertical Slice Architecture with the vocabulary of Clean/Hexagonal Architecture and
Domain-Driven Design. No framework, mediator or dependency-injection container is implied.

## Suffix glossary (the lint's role list)

| Suffix | Responsibility | Example |
|---|---|---|
| `.handler.ts` | Adapts a transport (HTTP, queue, timer, webhook). Not used by the library today. | – |
| `.use-case.ts` | Coordinates one operation, including I/O. | `run-steps.use-case.ts` |
| `.algorithm.ts` | Computes something purely: no decision with business meaning, no I/O. | `template.algorithm.ts` |
| `.policy.ts` | Makes a reusable decision. | `retry.policy.ts` |
| `.model.ts` | Holds a concept with meaning, state or invariants. | `extraction-scope.model.ts` |
| `.contract.ts` | Data crossing a boundary: a recipe file, a port interface, an event payload. | `input-recipe.contract.ts` |
| `.mapper.ts` | Deterministic conversion between representations. | `coerce-field.mapper.ts` |
| `.validator.ts` | Accepts or rejects data and says why. | `recipe-binding.validator.ts` |
| `.repository.ts` | Persistence expressed in domain terms. | `json-lines-sink.repository.ts` |
| `.client.ts` | An external protocol or vendor SDK. | `browser.client.ts` |
| `.store.ts` | Runtime state for its module: a cache, a memo, a registry. | `hook-registry.store.ts` |
| `.error.ts` | An error type a slice throws and callers catch. | `step-failure.error.ts` |
| `.config.ts` | Configuration owned by one module. | `crawl-options.config.ts` |
| `.enum.ts` | A technical enumeration. | `recipe-kind.enum.ts` |

`.service.ts` and `.middleware.ts` are **not** in the lint's role list and are not used here.

## Boundaries

- A sibling slice is imported only as `'../<slice>'` (its `index.ts`). Deep imports such as
  `'../billing/fee.policy'` fail lint. **Tests are held to this rule too.**
- A slice never imports its own `index.ts`.
- No two slices import each other, **type-only imports included**. A leaf slice that needs a type from a
  higher slice declares its own structural type instead (see `crawl-events` and `hooks`).
- Dependencies point one way: `index.ts -> crawl-execution -> feature slices -> leaf slices`. The graph is
  documented per slice in the plan and checked by `vertical-slices/no-slice-cycle` and `madge`-equivalent
  `import-x/no-cycle`.

## Naming rules

- Verb phrases for operations (`run-input-recipe.use-case.ts`), nouns for concepts (`output-record.model.ts`).
- TypeScript symbols keep their language conventions (PascalCase types, camelCase functions).
- No `helper`, `util`, `manager`, `processor`, `data` roles. No local `shared`, `common`, `helpers`, `utils`
  folders: shared behaviour becomes a named slice.

## Folder threshold

A slice with **12 hand-authored production files** is a review trigger, not permission to nest folders. Tests
and fixtures do not count. When a slice grows past it, split it into two slices with a clear dependency
direction and record the split here.

## Placement decision tree

```text
Does it coordinate an operation or I/O?          yes -> *.use-case.ts
  no -> Is it a reusable decision?                yes -> *.policy.ts
  no -> Does it hold meaning, state, invariants?  yes -> *.model.ts
  no -> Does data cross a boundary?               yes -> *.contract.ts
  no -> Does it convert representations?          yes -> *.mapper.ts
  no -> Is it a pure computation?                 yes -> *.algorithm.ts
  no -> Does it validate focused input?           yes -> *.validator.ts
  no -> Is it persistence in domain terms?        yes -> *.repository.ts
  no -> Is it an external protocol adapter?       yes -> *.client.ts
  no -> Is it runtime state / a registry?         yes -> *.store.ts
  no -> revisit the responsibility; never create a generic bucket
```

Place the file in the slice whose outcome would fail if the file disappeared.

## Recorded exceptions

| Path | Rule waived | Why | Temporary? |
|---|---|---|---|
| `packages/*/src/**/fixtures/**/*.{html,json,txt}` | markup/JSON lint | Test data, not code. | No |
| `packages/core/e2e/`, `packages/core/tools/` | slice rules | Outside `src/`: an e2e fixture server and a build script are not library slices. | No |

## PR checklist

- [ ] Path is kebab-case; the role suffix matches what the file does.
- [ ] The file is in the slice whose outcome it serves.
- [ ] Sibling imports go through `index.ts`; the barrel exports only what other slices use.
- [ ] Models, policies, algorithms and mappers contain no I/O.
- [ ] External protocols stay behind `.client.ts` files.
- [ ] `npm run format && npm run affected` is green.
