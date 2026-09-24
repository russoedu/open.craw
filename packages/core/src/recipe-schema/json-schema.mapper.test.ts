import { inputRecipeJsonSchema, outputRecipeJsonSchema } from './json-schema.mapper'

describe('JSON Schema emission', () => {
  it('produces a draft 2020-12 document for each recipe kind', () => {
    for (const document of [inputRecipeJsonSchema(), outputRecipeJsonSchema()]) {
      expect(document.$schema).toBe('https://json-schema.org/draft/2020-12/schema')
      expect(document.type).toBe('object')
      expect(typeof document.$id).toBe('string')
    }
  })

  it('names the recursive step and field schemas through $defs', () => {
    const input = JSON.stringify(inputRecipeJsonSchema())
    const output = JSON.stringify(outputRecipeJsonSchema())
    expect(input).toContain('"$ref"')
    expect(input).toContain('"forEach"')
    expect(output).toContain('"$ref"')
    expect(output).toContain('"currency"')
  })
})
