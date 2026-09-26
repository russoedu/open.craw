/* eslint-disable */
const { readFileSync } = require('fs')

// The e2e suite: the built package in real chromium. Separate from
// jest.config.cts so mnci's CI `test` target never needs a browser.
const swcJestConfig = JSON.parse(readFileSync(`${__dirname}/.spec.swcrc`, 'utf-8'))
swcJestConfig.swcrc = false

module.exports = {
  displayName: '@opencraw/office-reader (e2e)',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  roots: ['<rootDir>/e2e'],
  testMatch: ['**/*.e2e.test.ts'],
  testTimeout: 60000,
  maxWorkers:  1,
  transform: { '^.+\\.[tj]s$': ['@swc/jest', swcJestConfig] },
  moduleFileExtensions: ['ts', 'js', 'html'],
}
