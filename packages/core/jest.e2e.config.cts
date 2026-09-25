/* eslint-disable */
const { readFileSync } = require('fs')

// The e2e suite: real chromium against the fixture site in e2e/. Separate from
// jest.config.cts so mnci's CI `test` target never needs a browser.
const swcJestConfig = JSON.parse(readFileSync(`${__dirname}/.spec.swcrc`, 'utf-8'))
swcJestConfig.swcrc = false

module.exports = {
  displayName: '@opencraw/core (e2e)',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  // pdf.js is an ES module Jest cannot load itself: see jest-pdfjs.cjs.
  moduleNameMapper: { '^pdfjs-dist/legacy/build/pdf\\.mjs$': '<rootDir>/jest-pdfjs.cjs' },
  roots: ['<rootDir>/e2e'],
  testMatch: ['**/*.e2e.test.ts'],
  testTimeout: 60000,
  // The suites share one fixture port and one browser install: run them one after another.
  maxWorkers:  1,
  transform: { '^.+\\.[tj]s$': ['@swc/jest', swcJestConfig] },
  moduleFileExtensions: ['ts', 'js', 'html'],
}
