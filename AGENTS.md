# Working in this repository

## What it is

OpenCraw is an Nx monorepo (generated and maintained with `@mnci/cli`) holding `@opencraw/core`, a
recipe-driven crawler engine. Read `README.md`, then `docs/requirements.md` (the specification) and
`docs/recipes/authoring.md` (the recipe guide) before changing behaviour.

## Rules that lint enforces

The architecture is vertical feature slices, recorded in `docs/architecture/vertical-feature-slices.md`
and enforced by `@mnci/eslint-config`'s `verticalSlices` rules:

- `packages/*/src/<slice>/` is flat; only `fixtures/` may sit inside a slice, holding data.
- Every production file is `<kebab>.<role>.ts` with a role from: `handler use-case algorithm policy model
  contract mapper validator repository client store error config enum`. Tests are `<basename>.test.ts`.
- A sibling slice is imported only as `'../<slice>'` (its `index.ts`); tests too. No cycles, type imports
  included: a leaf slice declares its own structural types instead of importing from above.
- Only `index.ts` lives at the root of `src/`. Non-library code (`e2e/`, `tools/`) sits outside `src/`.
- Runtime dependencies go in `packages/core/package.json`, never the root (rollup externalises what the
  package declares; `@nx/dependency-checks` fails either drift).

Style is JavaScript Standard as ESLint rules (no semicolons, single quotes, space before function parens,
aligned object values, blank line before `return`). `npm run format` fixes most of it; there is no Prettier.

## Commands

```sh
npm run format && npm run affected      # what CI runs: lint, typecheck, test, build
npx nx run core:lint --skip-nx-cache    # dependency-checks needs the Nx graph; bare eslint skips it
npm run core:e2e                        # browser suite; needs `npm run playwright:install` once
OPENCRAW_CHROMIUM=/path/to/chrome npm run core:e2e   # ...or a preinstalled browser
npm run core:schemas                    # regenerate packages/core/schemas after a contract change
npx --yes @mnci/cli add npm-lib <name>  # a new publishable package; never scaffold by hand
```

Commit messages are Conventional Commits (husky + commitlint reject others); `nx release` derives
versions from them.

## Things that bit before

- Jest buffers output: a hanging test prints nothing. Suspect an endless `paginate` first.
- `create-nx-workspace` writes AI-agent folders whose scripts fail lint; they were deleted on purpose.
- `unicorn/max-nested-calls` is 3: build zod schemas from named sub-schemas.
- In-page functions for Playwright must not reference `window`/`document` as variables (lint's
  isolated-functions rule); pass a string script instead.
