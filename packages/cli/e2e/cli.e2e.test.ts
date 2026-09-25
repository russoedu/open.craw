import type { Server } from 'node:http'
import { execFile } from 'node:child_process'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { startFixtureSite, stopFixtureSite } from '../../core/e2e/fixture-site'

const run = promisify(execFile)
const BIN = join(__dirname, '..', 'bin', 'open-craw.mjs')
const FIXTURE_PORT = '4546'
const recipesDir = join(__dirname, '..', '..', 'core', 'e2e', 'recipes')

let site: Server
beforeAll(async () => {
  process.env.OPEN_CRAW_FIXTURE_PORT = FIXTURE_PORT
  site = await startFixtureSite()
})
afterAll(async () => { await stopFixtureSite(site) })

describe('open-craw cli', () => {
  it('validate: accepts the reference recipes and reports the binding', async () => {
    const { stdout } = await run('node', [BIN, 'validate', recipesDir])
    expect(stdout).toContain('ok: product <- shop-api, shop-web')
  })

  it('validate: lists every problem, one per line, on a bad recipe', async () => {
    await expect(run('node', [BIN, 'validate', join(__dirname, 'fixtures', 'bad.output.json')])).rejects.toMatchObject({
      code:   1,
      stderr: expect.stringContaining('fields'),
    })
  })

  it('run --dry-run: prints one record with its scope, against the fixture web recipe', async () => {
    const { stdout, stderr } = await run('node', [
      BIN, 'run', join(recipesDir, 'shop-web.input.json'), join(recipesDir, 'product.output.json'),
      '--dry-run', '--only', 'shop-web',
    ])
    expect(stdout).toContain('--- shop-web ---')
    expect(stdout).toContain('record: {')
    expect(stderr).toContain('shop-web:')
  }, 60000)

  it('run: writes JSON Lines to --out', async () => {
    const out = join(__dirname, 'out.jsonl')
    await run('node', [BIN, 'run', recipesDir, '--out', out, '--only', 'shop-web'])
    const { readFile } = await import('node:fs/promises')
    const content = await readFile(out, 'utf8')
    const lines = content.trim().split('\n')
    expect(lines).toHaveLength(6)
  }, 60000)
})
