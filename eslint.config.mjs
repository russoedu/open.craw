import mnci from './eslint.config.mnci.mjs'

export default [
  ...mnci({ verticalSlices: ['packages/*/src/**/*.ts'] }),
  { name: 'local/test-fixtures-are-data', ignores: ['packages/*/src/**/fixtures/**/*.{html,json,txt}'] },
  {
    name:  'local/contract-regexes-are-flag-free',
    files: ['packages/*/src/**/*.contract.ts'],
    rules: {
      'regexp/use-ignore-case': 'off',
      'no-restricted-syntax':   ['error', {
        selector: 'Literal[regex.flags=/./]',
        message:  'A contract regex becomes a JSON Schema pattern, which keeps no flags: write it without one (for example [A-Za-z] instead of the i flag).',
      }],
    },
  },
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
  {
    ignores: [
      '**/vite.config.*.timestamp*',
      '.claude/worktrees/**',
      // The desktop app's packaging output: a staged copy of dependencies and the unpacked app.
      'apps/studio-desktop/dist-app/**',
      'apps/studio-desktop/release/**',
    ],
  },
]
