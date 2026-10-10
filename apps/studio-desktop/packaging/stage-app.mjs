// Stages the folder electron-builder packs: the bundled main process, the preload, and the production
// dependencies installed from tarballs of the workspace packages (so the app carries exactly what is
// built here, not whatever version npm would resolve). Run after `nx build @opencraw/studio-desktop`
// and the builds of the packages it uses.
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = resolve(appDir, '..', '..')
const stage = join(appDir, 'dist-app')
const tarballs = join(stage, 'tarballs')
// Run npm's own CLI with this Node: no shell, so no quoting to get wrong and no .cmd shim on Windows.
const npmCli = process.env.npm_execpath ?? [
  join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js'),
  join(dirname(dirname(process.execPath)), 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
].find(candidate => existsSync(candidate))
if (npmCli === undefined) throw new Error('npm was not found next to this Node: run this through `npm run`')
const npm = (args, options) => execFileSync(process.execPath, [npmCli, ...args], options)
const PACKAGES = ['core', 'office-reader', 'probe', 'studio', 'cli']

for (const required of [join(appDir, 'dist', 'main.js'), join(appDir, 'dist', 'preload.cjs'), join(repoRoot, 'packages', 'studio', 'dist', 'ui', 'index.html')]) {
  if (!existsSync(required)) throw new Error(`${required} is missing: build the desktop app, the Studio server and the UI first`)
}

rmSync(stage, { recursive: true, force: true })
mkdirSync(tarballs, { recursive: true })

const dependencies = {}
for (const name of PACKAGES) {
  const directory = join(repoRoot, 'packages', name)
  const packed = JSON.parse(npm(['pack', '--json', '--pack-destination', tarballs], { cwd: directory }).toString())
  dependencies[`@opencraw/${name}`] = `file:tarballs/${packed[0].filename}`
}

const desktop = JSON.parse(readFileSync(join(appDir, 'package.json'), 'utf8'))
// electron-builder needs the exact Electron release, and the staged app does not install Electron itself.
const electronVersion = createRequire(import.meta.url)('electron/package.json').version
writeFileSync(join(stage, 'package.json'), JSON.stringify({
  name:            'opencraw-studio',
  productName:     'OpenCraw Studio',
  version:         desktop.version,
  description:     desktop.description,
  type:            'module',
  main:            'main.js',
  author:          'OpenCraw',
  license:         'UNLICENSED',
  dependencies,
  devDependencies: { electron: electronVersion },
  // The workspace packages depend on each other by version; point those at the same tarballs.
  overrides:       dependencies,
}, undefined, 2))
cpSync(join(appDir, 'dist', 'main.js'), join(stage, 'main.js'))
cpSync(join(appDir, 'dist', 'preload.cjs'), join(stage, 'preload.cjs'))

npm(['install', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund', '--no-package-lock'], { cwd: stage, stdio: 'inherit' })
process.stdout.write(`staged ${stage}\n`)
