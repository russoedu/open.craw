import mnci from '@mnci/eslint-config'

// The root config is @mnci/eslint-config in full (run `npx eslint --inspect-config` to
// list every block). Three local decisions on top:
//
//   verticalSlices    the architecture in docs/architecture/vertical-feature-slices.md,
//                     enforced: every package's src/ holds flat, kebab-case, role-suffixed
//                     subfeatures reached only through their index, with no cycles.
//   fixtures          HTML/JSON under a slice's fixtures/ folder is test DATA, so the
//                     markup and JSON linters do not apply to it.
//   dependency-checks `npm run format` is `eslint --fix`, and this rule's fixer REWRITES
//                     package.json to match the Nx project graph. With a stale graph it
//                     deleted playwright, cheerio and jsonpath-plus from @open.craw/core and
//                     pinned zod. Missing-dependency detection stays on (its fix only adds);
//                     the two fixes that remove or re-pin declared dependencies are off.
export default [
  ...mnci({ workspaceRoot: import.meta.dirname, verticalSlices: ['packages/*/src/**/*.ts'] }),
  { name: 'local/test-fixtures-are-data', ignores: ['packages/*/src/**/fixtures/**/*.{html,json,txt}'] },
  {
    name:  'local/dependency-checks-never-remove',
    files: ['packages/*/package.json', 'libs/*/package.json'],
    // Rule options replace mnci's rather than merge, so its ignoredFiles are repeated here.
    rules: {
      '@nx/dependency-checks': ['error', {
        checkObsoleteDependencies: false,
        checkVersionMismatches:    false,
        ignoredFiles:              [
          '{projectRoot}/eslint.config.{js,cjs,mjs,ts,cts,mts}',
          '{projectRoot}/rollup.config.{js,ts,mjs,mts,cjs,cts}',
          '{projectRoot}/jest.config.{js,ts,mjs,mts,cjs,cts}',
          '{projectRoot}/jest.e2e.config.{js,ts,mjs,mts,cjs,cts}',
          '{projectRoot}/e2e/**',
          '{projectRoot}/tools/**',
          '{projectRoot}/**/*.spec.{js,ts,jsx,tsx}',
          '{projectRoot}/**/*.test.{js,ts,jsx,tsx}',
        ],
      }],
    },
  },
]
