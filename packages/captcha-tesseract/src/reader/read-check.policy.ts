import { keepCharset } from '../charset'
import type { ReadSymbol } from './reader.contract'

export interface ReadRules {
  characters:    string
  length?:       number | [number, number]
  minConfidence: number
}

export interface JudgedRead {
  text:       string
  confidence: number
  problem?:   string
}

/**
 * Judges a read before anything is submitted: kept to the charset, it must
 * have the code's length, and every character must be sure enough. This is
 * the only check possible before posting the form, and it is free: a read
 * that fails it is refreshed, never sent. A clipped last character is the
 * usual failure: Tesseract reads it short, or unsure.
 *
 * @param raw - Tesseract's text.
 * @param symbols - Its characters with their confidence.
 * @param rules - The charset, the length, the least confidence.
 * @returns The filtered text, its least confidence, and the problem, if any.
 */
export function judgeRead (raw: string, symbols: readonly ReadSymbol[], rules: ReadRules): JudgedRead {
  const text = keepCharset(raw, rules.characters)
  const kept = symbols.filter(symbol => keepCharset(symbol.text, rules.characters) !== '')
  const confidence = kept.length === 0 ? 0 : Math.round(Math.min(...kept.map(symbol => symbol.confidence)))
  const [shortest, longest] = typeof rules.length === 'number' ? [rules.length, rules.length] : (rules.length ?? [1, Infinity])
  if (text.length < shortest || text.length > longest) return { text, confidence, problem: `read ${text.length} characters ("${text}"), expected ${shortest === longest ? shortest : `${shortest} to ${longest}`}` }
  if (confidence < rules.minConfidence) return { text, confidence, problem: `a character read at ${confidence}% confidence, under ${rules.minConfidence}%` }

  return { text, confidence }
}
