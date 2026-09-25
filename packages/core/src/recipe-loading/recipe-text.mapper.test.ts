import { parseRecipeText } from './recipe-text.mapper'

describe('parseRecipeText', () => {
  it('reads one JSON document, an array, and JSON Lines', () => {
    expect(parseRecipeText('{"id":"a"}', 'x')).toEqual([{ source: 'x', content: { id: 'a' } }])
    expect(parseRecipeText('[{"id":"a"},{"id":"b"}]', 'x').map(document => document.source)).toEqual(['x[0]', 'x[1]'])
    expect(parseRecipeText('{"id":"a"}\n\n{"id":"b"}\r\n', 'x')).toEqual([{ source: 'x:1', content: { id: 'a' } }, { source: 'x:3', content: { id: 'b' } }])
  })

  it('strips a byte order mark and accepts pretty-printed JSON', () => {
    expect(parseRecipeText('﻿{\n  "id": "a"\n}\n', 'x')).toEqual([{ source: 'x', content: { id: 'a' } }])
  })

  it('names the broken line in JSON Lines, and the document when it is not JSON Lines at all', () => {
    expect(() => parseRecipeText('{"id":"a"}\n{"id":', 'x')).toThrow(/^x:2: not valid JSON/)
    expect(() => parseRecipeText('{\n  "id": "a",\n}', 'x')).toThrow(/^x: not valid JSON/)
    expect(() => parseRecipeText('  \n', 'x')).toThrow('x: empty')
  })
})
