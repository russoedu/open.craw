// Jest runs tests as CommonJS in its own module registry, which cannot load
// pdf.js (an ES module that reads import.meta), and it hands tests its own
// `module` builtin. Node's real one, from process.getBuiltinModule, gives a
// native require, which loads ES modules. Tests only: the published build
// imports pdf.js natively.
const { createRequire } = process.getBuiltinModule('node:module')

module.exports = createRequire(__filename)('pdfjs-dist/legacy/build/pdf.mjs')
