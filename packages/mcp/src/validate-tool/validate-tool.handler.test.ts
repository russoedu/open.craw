import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { validateTool } from './validate-tool.handler'

const fixtures = join(__dirname, 'fixtures')

function recipe (name: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(fixtures, name), 'utf8')) as Record<string, unknown>
}

function json (result: Awaited<ReturnType<typeof validateTool>>): unknown {
  return JSON.parse((result.content[0] as { text: string }).text)
}

describe('validateTool', () => {
  it('reports ok with the output and input ids when the recipes bind', async () => {
    const result = await validateTool({ paths: [join(fixtures, 'thing.output.json'), join(fixtures, 'one.input.json')] })
    expect(result.isError).toBeUndefined()
    expect(json(result)).toEqual({ ok: true, output: 'thing', inputs: ['one'], issues: [] })
  })

  it('lists a schema problem with its path and the file it came from', async () => {
    const result = await validateTool({ paths: [join(fixtures, 'bad.output.json')] })
    const body = json(result) as { ok: boolean, issues: { path: string, message: string, source: string }[] }
    expect(body.ok).toBe(false)
    expect(body.issues.some(issue => issue.source.endsWith('bad.output.json') && issue.path === 'fields')).toBe(true)
  })

  it('lists a binding problem (an unresolved mapping source)', async () => {
    const result = await validateTool({ paths: [join(fixtures, 'thing.output.json'), join(fixtures, 'unbound.input.json')] })
    const body = json(result) as { ok: boolean, issues: { message: string }[] }
    expect(body.ok).toBe(false)
    expect(body.issues.some(issue => issue.message.includes('missing_id'))).toBe(true)
  })

  it('validates recipes passed inline, as objects or as JSON Lines text', async () => {
    const objects = [recipe('thing.output.json'), recipe('one.input.json')]
    expect(json(await validateTool({ recipes: objects }))).toEqual({ ok: true, output: 'thing', inputs: ['one'], issues: [] })
    const jsonLines = objects.map(value => JSON.stringify(value)).join('\n')
    expect(json(await validateTool({ recipes: jsonLines }))).toEqual({ ok: true, output: 'thing', inputs: ['one'], issues: [] })
  })

  it('labels an inline recipe\'s problems by position, and a line that is not JSON', async () => {
    const recipes = [recipe('thing.output.json'), { ...recipe('one.input.json'), mode: 'ftp' }]
    const bad = json(await validateTool({ recipes })) as { issues: { path: string, source: string }[] }
    expect(bad.issues).toContainEqual(expect.objectContaining({ path: 'mode', source: 'recipes[1]' }))
    const text = `${JSON.stringify(recipe('thing.output.json'))}\n{"kind":`
    const broken = json(await validateTool({ recipes: text })) as { ok: boolean, issues: { message: string }[] }
    expect(broken.ok).toBe(false)
    expect(broken.issues[0].message).toMatch(/^recipes:2: not valid JSON/)
  })

  it('needs exactly one of paths and recipes', async () => {
    const body = json(await validateTool({})) as { ok: boolean, issues: { message: string }[] }
    expect(body.issues[0].message).toContain('exactly one of "paths" or "recipes"')
  })
})
