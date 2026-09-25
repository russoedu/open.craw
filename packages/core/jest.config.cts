/* eslint-disable */
const { readFileSync } = require('fs')

// Reading the SWC compilation config for the spec files
const swcJestConfig = JSON.parse(readFileSync(`${__dirname}/.spec.swcrc`, 'utf-8'))

// Disable .swcrc look-up by SWC core because we're passing in swcJestConfig ourselves
swcJestConfig.swcrc = false

module.exports = {
  displayName: '@opencraw/core',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  // Browser-driven tests live in e2e/ and run through `nx run core:e2e`, never inside `test`.
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/e2e/', '\\.e2e\\.test\\.ts$'],
  transform: {
    '^.+\\.[tj]s$': ['@swc/jest', swcJestConfig],
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  // pdf.js is an ES module Jest cannot load itself: see jest-pdfjs.cjs.
  moduleNameMapper: { '^pdfjs-dist/legacy/build/pdf\\.mjs$': '<rootDir>/jest-pdfjs.cjs' },
  coverageDirectory: 'test-output/jest/coverage',
}
