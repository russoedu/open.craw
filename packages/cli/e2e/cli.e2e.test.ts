import type { Server } from 'node:http'
import { execFile } from 'node:child_process'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { startFixtureSite, stopFixtureSite } from '../../core/e2e/fixture-site'

const run = promisify(execFile)
const BIN = join(__dirname, '..', 'bin', 'opencraw.mjs')
const FIXTURE_PORT = '4546'
const recipesDir = join(__dirname, '..', '..', 'core', 'e2e', 'recipes')
const hooksModule = join(__dirname, '..', '..', 'core', 'e2e', 'shop-hooks.mjs')

let site: Server
beforeAll(async () => {
  process.env.OPENCRAW_FIXTURE_PORT = FIXTURE_PORT
  site = await startFixtureSite()
})
afterAll(async () => { await stopFixtureSite(site) })

describe('opencraw cli', () => {
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

  it('run --hooks: both reference recipes, the api one calling a hook, write the same six records to --out', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'cli-e2e-'))
    const out = join(directory, 'out.jsonl')
    const { stderr } = await run('node', [BIN, 'run', recipesDir, '--out', out, '--hooks', hooksModule])
    expect(stderr).toMatch(/shop-api: 6 emitted/)
    expect(stderr).toMatch(/shop-web: 0 emitted, 0 rejected, 6 duplicates/)
    const content = await readFile(out, 'utf8')
    expect(content.trim().split('\n')).toHaveLength(6)
  }, 60000)

  it('run: without the hooks module, the api recipe stops on the hook it cannot find', async () => {
    await expect(run('node', [BIN, 'run', recipesDir, '--only', 'shop-api'], { env: { ...process.env, OPENCRAW_HOOKS: '' } })).rejects.toMatchObject({
      code:   1,
      stderr: expect.stringContaining('positive'),
    })
  }, 60000)
})
