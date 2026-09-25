import { join } from 'node:path'
import { runTool } from './run-tool.handler'

describe('runTool', () => {
  it('reports a load failure as an error result, not a throw', async () => {
    const result = await runTool({ paths: [join(__dirname, '..', 'validate-tool', 'fixtures', 'bad.output.json')] })
    expect(result.isError).toBe(true)
    expect((result.content[0] as { text: string }).text).toContain('version')
  })

  it('reports when "only" matches no input recipe', async () => {
    const fixtures = join(__dirname, '..', 'validate-tool', 'fixtures')
    const result = await runTool({ paths: [join(fixtures, 'thing.output.json'), join(fixtures, 'one.input.json')], only: ['nope'] })
    expect(result.isError).toBe(true)
    expect((result.content[0] as { text: string }).text).toContain('no input recipe matches')
  })
})
