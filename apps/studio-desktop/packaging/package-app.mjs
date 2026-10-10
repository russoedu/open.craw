// Builds the installer for this platform: stages the app, then runs electron-builder on it. Pass
// `--dir` for an unpacked app (quick, for trying it) or nothing for the installer. Unsigned: signing and
// the update feed are not wired yet (issue #96).
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)
const electronVersion = require('electron/package.json').version
const builderCli = join(dirname(require.resolve('electron-builder/package.json')), 'cli.js')

execFileSync(process.execPath, [join(appDir, 'packaging', 'stage-app.mjs')], { cwd: appDir, stdio: 'inherit' })
execFileSync(process.execPath, [builderCli, '--config', 'electron-builder.yml', `-c.electronVersion=${electronVersion}`, ...process.argv.slice(2)], { cwd: appDir, stdio: 'inherit' })
