import { basename, join } from 'node:path'
import { readRecipeFiles } from './read-recipe-files.repository'

const fixtures = join(__dirname, 'fixtures')

describe('readRecipeFiles', () => {
  it('expands directories and splits files by kind', async () => {
    const files = await readRecipeFiles([fixtures])
    expect(files.outputs.map(file => basename(file.path))).toEqual(['thing.output.json'])
    expect(files.inputs.map(file => basename(file.path))).toEqual(['one.input.json'])
    expect(files.others.map(file => basename(file))).toEqual(['notes.json'])
    expect((files.inputs[0].recipe as { id: string }).id).toBe('one')
  })

  it('reads single files and names one that is not JSON', async () => {
    const files = await readRecipeFiles([join(fixtures, 'one.input.json')])
    expect(files.inputs).toHaveLength(1)
    await expect(readRecipeFiles([join(__dirname, 'index.ts')])).rejects.toThrow(/not valid JSON/)
    await expect(readRecipeFiles([join(fixtures, 'missing.json')])).rejects.toThrow()
  })
})
