import mnci from '@mnci/eslint-config'

// The root config is @mnci/eslint-config in full (run `npx eslint --inspect-config` to
// list every block). Two local decisions on top:
//
//   verticalSlices  the architecture in docs/architecture/vertical-feature-slices.md,
//                   enforced: every package's src/ holds flat, kebab-case, role-suffixed
//                   subfeatures reached only through their index, with no cycles.
//   fixtures        HTML/JSON under a slice's fixtures/ folder is test DATA, so the
//                   markup and JSON linters do not apply to it.
export default [
  ...mnci({ workspaceRoot: import.meta.dirname, verticalSlices: ['packages/*/src/**/*.ts'] }),
  { name: 'local/test-fixtures-are-data', ignores: ['packages/*/src/**/fixtures/**/*.{html,json,txt}'] },
]
