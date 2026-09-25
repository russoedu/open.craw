import { recipeSourceOf } from './recipe-source.mapper'

describe('recipeSourceOf', () => {
  it('passes paths and recipe objects through, and turns text into bytes so it is never read as a path', () => {
    expect(recipeSourceOf({ paths: ['a.json'] })).toEqual(['a.json'])
    expect(recipeSourceOf({ recipes: [{ kind: 'output' }] })).toEqual([{ kind: 'output' }])
    expect(Buffer.isBuffer(recipeSourceOf({ recipes: 'recipes/x.json' }))).toBe(true)
  })

  it('needs exactly one of paths and recipes', () => {
    expect(() => recipeSourceOf({})).toThrow('exactly one')
    expect(() => recipeSourceOf({ paths: ['a'], recipes: [] })).toThrow('exactly one')
  })
})
