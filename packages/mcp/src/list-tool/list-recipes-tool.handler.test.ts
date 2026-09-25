import { join } from 'node:path'
import { listRecipesTool } from './list-recipes-tool.handler'

describe('listRecipesTool', () => {
  it('splits a directory of recipe files by kind, with ids', async () => {
    const result = await listRecipesTool({ dir: join(__dirname, '..', 'validate-tool', 'fixtures') })
    const body = JSON.parse((result.content[0] as { text: string }).text) as { outputs: { id?: string }[], inputs: { id?: string, output?: string, mode?: string }[], others: string[] }
    expect(body.outputs.map(file => file.id)).toEqual(expect.arrayContaining(['thing', 'bad']))
    expect(body.inputs).toEqual(expect.arrayContaining([
      { path: expect.stringContaining('one.input.json'), id: 'one', output: 'thing', mode: 'api' },
    ]))
  })
})
