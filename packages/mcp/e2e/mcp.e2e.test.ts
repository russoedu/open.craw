import type { Server } from 'node:http'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { startFixtureSite, stopFixtureSite } from '../../core/e2e/fixture-site'

const BIN = join(__dirname, '..', 'bin', 'opencraw-mcp.mjs')
const FIXTURE_PORT = '4547'
const recipesDir = join(__dirname, '..', '..', 'core', 'e2e', 'recipes')

let site: Server
let client: Client

beforeAll(async () => {
  process.env.OPENCRAW_FIXTURE_PORT = FIXTURE_PORT
  site = await startFixtureSite()
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) if (value !== undefined) env[key] = value
  const transport = new StdioClientTransport({ command: 'node', args: [BIN], env })
  client = new Client({ name: 'e2e-client', version: '0.0.1' })
  await client.connect(transport)
})

afterAll(async () => {
  await client.close()
  await stopFixtureSite(site)
})

function textOf (result: Awaited<ReturnType<Client['callTool']>>): unknown {
  const content = result.content as { type: string, text?: string }[]

  return JSON.parse(content[0].text ?? '{}')
}

/** A recipe file as one line of JSON Lines. */
function oneLine (path: string): string {
  return JSON.stringify(JSON.parse(readFileSync(path, 'utf8')))
}

describe('opencraw mcp server', () => {
  it('lists the four crawl-primitive tools', async () => {
    const { tools } = await client.listTools()
    expect(tools.map(tool => tool.name).sort((a, b) => a.localeCompare(b))).toEqual(['list_recipes', 'probe', 'run', 'validate'])
  })

  it('validate: accepts the reference recipes and reports the binding', async () => {
    const result = await client.callTool({ name: 'validate', arguments: { paths: [recipesDir] } })
    expect(result.isError).toBeUndefined()
    expect(textOf(result)).toMatchObject({ ok: true, output: 'product', inputs: ['shop-api', 'shop-web'] })
  })

  it('validate: reports a bad recipe as an issue, not a thrown error', async () => {
    const result = await client.callTool({ name: 'validate', arguments: { paths: [join(__dirname, 'fixtures', 'bad.output.json')] } })
    const body = textOf(result) as { ok: boolean, issues: { path: string }[] }
    expect(body.ok).toBe(false)
    expect(body.issues.some(issue => issue.path === 'fields')).toBe(true)
  })

  it('list_recipes: splits the reference recipes by kind', async () => {
    const result = await client.callTool({ name: 'list_recipes', arguments: { dir: recipesDir } })
    const body = textOf(result) as { outputs: { id?: string }[], inputs: { id?: string }[] }
    expect(body.outputs.map(file => file.id)).toEqual(['product'])
    expect(body.inputs.map(file => file.id).sort((a, b) => String(a).localeCompare(String(b)))).toEqual(['shop-api', 'shop-web'])
  })

  it('run: dryRun against the fixture shop returns one record with its report', async () => {
    const result = await client.callTool({ name: 'run', arguments: { paths: [recipesDir], only: ['shop-web'], dryRun: true } })
    expect(result.isError).toBeFalsy()
    const body = textOf(result) as { report: { recipes: { recipeId: string, emitted: number }[] }, records?: unknown[] }
    expect(body.report.recipes).toEqual([expect.objectContaining({ recipeId: 'shop-web', emitted: 1 })])
    expect(body.records).toHaveLength(1)
  }, 30000)

  it('run: takes the recipes inline as JSON Lines, for a host that cannot write files', async () => {
    const jsonLines = ['product.output.json', 'shop-web.input.json'].map(name => oneLine(join(recipesDir, name))).join('\n')
    const result = await client.callTool({ name: 'run', arguments: { recipes: jsonLines, dryRun: true } })
    expect(result.isError).toBeFalsy()
    const body = textOf(result) as { report: { recipes: { recipeId: string, emitted: number }[] }, records?: unknown[] }
    expect(body.report.recipes).toEqual([expect.objectContaining({ recipeId: 'shop-web', emitted: 1 })])
  }, 30000)
})
