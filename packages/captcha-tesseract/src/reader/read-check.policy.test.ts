import { judgeRead } from './read-check.policy'

const symbols = (text: string, confidence = 95): { text: string, confidence: number }[] => [...text].map(character => ({ text: character, confidence }))
const rules = { characters: 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789', length: 6, minConfidence: 50 }

describe('judgeRead', () => {
  it('passes a read of the right length whose characters are all sure', () => {
    expect(judgeRead('56f2U9', symbols('56f2U9'), rules)).toEqual({ text: '56f2U9', confidence: 95 })
  })

  it('drops characters outside the charset before judging', () => {
    expect(judgeRead('Fd 83|ZY', symbols('Fd 83|ZY'), rules)).toEqual({ text: 'Fd83ZY', confidence: 95 })
  })

  it('refuses a read of another length: a clipped last character, a doubled one', () => {
    expect(judgeRead('6SW36', symbols('6SW36'), rules).problem).toBe('read 5 characters ("6SW36"), expected 6')
    expect(judgeRead('qQ25Z8r', symbols('qQ25Z8r'), rules).problem).toBe('read 7 characters ("qQ25Z8r"), expected 6')
    expect(judgeRead('abcd', symbols('abcd'), { ...rules, length: [5, 7] }).problem).toBe('read 4 characters ("abcd"), expected 5 to 7')
  })

  it('refuses a read with an unsure character, judged by the least sure one', () => {
    const unsure = [...symbols('MMt3b'), { text: '2', confidence: 31 }]
    expect(judgeRead('MMt3b2', unsure, rules)).toEqual({ text: 'MMt3b2', confidence: 31, problem: 'a character read at 31% confidence, under 50%' })
  })

  it('takes any length when none is set', () => {
    expect(judgeRead('ab', symbols('ab'), { ...rules, length: undefined }).problem).toBeUndefined()
  })
})
