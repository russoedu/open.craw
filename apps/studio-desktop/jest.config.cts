/* eslint-disable */
const { readFileSync } = require('fs')

// Reading the SWC compilation config for the spec files
const swcJestConfig = JSON.parse(
  readFileSync(`${__dirname}/.spec.swcrc`, 'utf-8')
);

// Disable .swcrc look-up by SWC core because we're passing in swcJestConfig ourselves
swcJestConfig.swcrc = false;

module.exports = {
  displayName: '@opencraw/studio-desktop',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  // Unit tests only: the e2e suite has its own config, and dist-app/release hold whole node_modules trees.
  roots: ['<rootDir>/src'],
  transform: {
    '^.+\\.[tj]s$': ['@swc/jest', swcJestConfig]
  },
  moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageDirectory: 'test-output/jest/coverage'
};
