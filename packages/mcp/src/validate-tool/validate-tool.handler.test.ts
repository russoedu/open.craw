import { join } from 'node:path'
import { validateTool } from './validate-tool.handler'

const fixtures = join(__dirname, 'fixtures')

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
})
