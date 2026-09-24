/**
 * A small expression language for `{{ }}` placeholders: literals, paths,
 * arithmetic, comparison, logic, `??`, `a ? b : c` and a fixed set of
 * functions. It is parsed into a tree and walked; nothing is ever compiled or
 * evaluated as JavaScript, and a path can only read own properties of plain
 * data, so `constructor`, `__proto__` and friends resolve to nothing.
 */

import { isTruthy, stringify } from './value-text.algorithm'
import type { Lookup } from './value-text.algorithm'

const MAX_TOKENS = 512
const MAX_DEPTH = 64

type Token =
  | { kind: 'number', value: number, at: number } |
  { kind: 'string', value: string, at: number } |
  { kind: 'path', value: string, at: number } |
  { kind: 'op', value: string, at: number } |
  { kind: 'end', at: number }

export type Expression =
  | { kind: 'literal', value: unknown } |
  { kind: 'path', path: string } |
  { kind: 'unary', op: '-' | '!', operand: Expression } |
  { kind: 'binary', op: string, left: Expression, right: Expression } |
  { kind: 'ternary', test: Expression, consequent: Expression, alternate: Expression } |
  { kind: 'call', name: string, args: Expression[] }

const OPERATORS = ['??', '&&', '||', '==', '!=', '<=', '>=', '<', '>', '+', '-', '*', '/', '%', '!', '?', ':', '(', ')', ','] as const
const PATH_START = /[A-Z_$@]/i
const PATH_PART = /[\w$@]/
const KEYWORDS: Record<string, unknown> = { true: true, false: false, null: null }

/** Binding power of each binary operator; higher binds tighter. */
const PRECEDENCE: Record<string, number> = { '??': 2, '||': 3, '&&': 4, '==': 5, '!=': 5, '<': 6, '<=': 6, '>': 6, '>=': 6, '+': 7, '-': 7, '*': 8, '/': 8, '%': 8 }

type Fn = (args: unknown[]) => unknown

/** The functions an expression may call. Held in a `Map`, so nothing on `Object.prototype` is reachable by name. */
const FUNCTION_ENTRIES: [string, Fn][] = [
  ['upper', ([value]) => stringify(value).toUpperCase()],
  ['lower', ([value]) => stringify(value).toLowerCase()],
  ['trim', ([value]) => stringify(value).trim()],
  ['len', ([value]) => (typeof value === 'string' || Array.isArray(value) ? value.length : 0)],
  ['default', ([value, fallback]) => ([undefined, null, ''].includes(value as null) ? fallback : value)],
  ['round', ([value, digits]) => roundTo(toNumber(value), toNumber(digits) ?? 0)],
  ['number', ([value]) => toNumber(value)],
  ['join', ([list, separator]) => (Array.isArray(list) ? list.map(item => stringify(item)).join(stringify(separator ?? ',')) : stringify(list))],
  ['first', ([list]) => (Array.isArray(list) ? list[0] : list)],
  ['last', ([list]) => (Array.isArray(list) ? list.at(-1) : list)],
  ['replace', ([value, pattern, replacement]) => stringify(value).replaceAll(new RegExp(stringify(pattern), 'g'), () => stringify(replacement))],
  ['contains', ([haystack, needle]) => (Array.isArray(haystack) ? haystack.some(item => looseEqual(item, needle)) : stringify(haystack).includes(stringify(needle)))],
  ['split', ([value, separator]) => stringify(value).split(stringify(separator ?? ','))],
]
const FUNCTIONS = new Map<string, Fn>(FUNCTION_ENTRIES)

/** The names an expression may call. */
export const EXPRESSION_FUNCTIONS: readonly string[] = FUNCTION_ENTRIES.map(([name]) => name)

/**
 * Tokenizes an expression.
 *
 * @param source - The text inside the placeholder.
 * @returns The tokens, ending with `end`.
 * @throws Error on a character that is not part of the language.
 */
function tokenize (source: string): Token[] {
  const tokens: Token[] = []
  let at = 0
  while (at < source.length) {
    const char = source[at]
    if (/\s/.test(char)) {
      at += 1
      continue
    }
    if (tokens.length >= MAX_TOKENS) throw new Error(`expression too long (more than ${MAX_TOKENS} tokens)`)
    if (/\d/.test(char) || (char === '.' && /\d/.test(source[at + 1] ?? ''))) {
      const match = /^\d*\.?\d+(?:e[+-]?\d+)?/i.exec(source.slice(at))
      if (match === null) throw new Error(`bad number at ${at}`)
      tokens.push({ kind: 'number', value: Number(match[0]), at })
      at += match[0].length
      continue
    }
    if (char === '\'' || char === '"') {
      const end = source.indexOf(char, at + 1)
      if (end === -1) throw new Error(`unterminated string at ${at}`)
      tokens.push({ kind: 'string', value: source.slice(at + 1, end), at })
      at = end + 1
      continue
    }
    if (PATH_START.test(char)) {
      const start = at
      at = readPath(source, at)
      tokens.push({ kind: 'path', value: source.slice(start, at), at: start })
      continue
    }
    const op = OPERATORS.find(candidate => source.startsWith(candidate, at))
    if (op === undefined) throw new Error(`unexpected "${char}" at ${at}`)
    tokens.push({ kind: 'op', value: op, at })
    at += op.length
  }
  tokens.push({ kind: 'end', at })

  return tokens
}

/** Reads `a.b[0].c` from `at`; returns where it ends. */
function readPath (source: string, at: number): number {
  let cursor = at
  for (;;) {
    while (cursor < source.length && PATH_PART.test(source[cursor])) cursor += 1
    if (source[cursor] === '.' && PATH_START.test(source[cursor + 1] ?? '')) {
      cursor += 1
      continue
    }
    const index = /^\[\d+\]/.exec(source.slice(cursor))
    if (index !== null) {
      cursor += index[0].length
      if (source[cursor] === '.' && PATH_START.test(source[cursor + 1] ?? '')) cursor += 1
      continue
    }

    return cursor
  }
}

class Parser {
  private index = 0
  private depth = 0

  constructor (private readonly tokens: Token[], private readonly source: string) {}

  private ternary (): Expression {
    this.enter()
    const test = this.binary(0)
    let result = test
    if (this.take('?')) {
      const then = this.ternary()
      this.expect(':')
      result = { kind: 'ternary', test, consequent: then, alternate: this.ternary() }
    }
    this.depth -= 1

    return result
  }

  private binary (minimum: number): Expression {
    this.enter()
    let left = this.unary()
    for (;;) {
      const token = this.peek()
      if (token.kind !== 'op') break
      const precedence = PRECEDENCE[token.value]
      if (precedence === undefined || precedence <= minimum) break
      this.index += 1
      left = { kind: 'binary', op: token.value, left, right: this.binary(precedence) }
    }
    this.depth -= 1

    return left
  }

  private unary (): Expression {
    if (this.take('-')) return { kind: 'unary', op: '-', operand: this.unary() }
    if (this.take('!')) return { kind: 'unary', op: '!', operand: this.unary() }

    return this.primary()
  }

  private primary (): Expression {
    const token = this.next()
    switch (token.kind) {
      case 'number': { return { kind: 'literal', value: token.value }
      }
      case 'string': { return { kind: 'literal', value: token.value }
      }
      case 'path': {
        if (Object.hasOwn(KEYWORDS, token.value)) return { kind: 'literal', value: KEYWORDS[token.value] }
        if (this.take('(')) return this.call(token)

        return { kind: 'path', path: token.value }
      }
      case 'op': {
        if (token.value === '(') {
          const inner = this.ternary()
          this.expect(')')

          return inner
        }
        throw this.error(token, `unexpected "${token.value}"`)
      }
      default: { throw this.error(token, 'unexpected end')
      }
    }
  }

  private call (token: Extract<Token, { kind: 'path' }>): Expression {
    if (!FUNCTIONS.has(token.value)) throw this.error(token, `unknown function "${token.value}" (known: ${EXPRESSION_FUNCTIONS.join(', ')})`)
    const args: Expression[] = []
    if (!this.take(')')) {
      do args.push(this.ternary()); while (this.take(','))
      this.expect(')')
    }

    return { kind: 'call', name: token.value, args }
  }

  private enter (): void {
    this.depth += 1
    if (this.depth > MAX_DEPTH) throw new Error(`expression nested too deeply (more than ${MAX_DEPTH} levels) in "${this.source}"`)
  }

  private peek (): Token {
    return this.tokens[this.index]
  }

  private next (): Token {
    const token = this.tokens[this.index]
    this.index += 1

    return token
  }

  private take (op: string): boolean {
    const token = this.peek()
    if (token.kind === 'op' && token.value === op) {
      this.index += 1

      return true
    }

    return false
  }

  private expect (op: string): void {
    if (!this.take(op)) throw this.error(this.peek(), `expected "${op}"`)
  }

  private error (token: Token, message: string): Error {
    return new Error(`${message} at ${token.at} in "${this.source}"`)
  }

  parse (): Expression {
    const expression = this.ternary()
    const token = this.peek()
    if (token.kind !== 'end') throw this.error(token, 'unexpected token')

    return expression
  }
}

const cache = new Map<string, Expression>()
const CACHE_LIMIT = 1000

/**
 * Parses an expression, with a small cache since templates render per iteration.
 *
 * @param source - The text inside the placeholder.
 * @returns The tree.
 * @throws Error naming the position of the first problem.
 */
export function parseExpression (source: string): Expression {
  const cached = cache.get(source)
  if (cached !== undefined) return cached
  const expression = new Parser(tokenize(source), source).parse()
  if (cache.size >= CACHE_LIMIT) cache.clear()
  cache.set(source, expression)

  return expression
}

/**
 * Evaluates a tree against a lookup. A function found where data is expected
 * counts as `undefined`, so nothing callable ever leaks out of the scope.
 *
 * @param expression - The tree.
 * @param lookup - Resolves a path.
 * @returns The value.
 */
export function evaluateExpression (expression: Expression, lookup: Lookup): unknown {
  switch (expression.kind) {
    case 'literal': { return expression.value
    }
    case 'path': { return data(lookup(expression.path))
    }
    case 'unary': {
      const operand = evaluateExpression(expression.operand, lookup)
      if (expression.op === '!') return !isTruthy(operand)
      const number = toNumber(operand)

      return number === undefined ? undefined : -number
    }
    case 'ternary': {
      const chosen = isTruthy(evaluateExpression(expression.test, lookup)) ? expression.consequent : expression.alternate

      return data(evaluateExpression(chosen, lookup))
    }
    case 'call': { return data(FUNCTIONS.get(expression.name)?.(expression.args.map(argument => evaluateExpression(argument, lookup))))
    }
    default: { return binary(expression, lookup)
    }
  }
}

function binary (expression: Extract<Expression, { kind: 'binary' }>, lookup: Lookup): unknown {
  const left = evaluateExpression(expression.left, lookup)
  const shortCircuit = shortCircuitOf(expression.op, left)
  if (shortCircuit !== undefined) return shortCircuit.value === 'left' ? left : evaluateExpression(expression.right, lookup)
  const right = evaluateExpression(expression.right, lookup)
  switch (expression.op) {
    case '==': { return looseEqual(left, right)
    }
    case '!=': { return !looseEqual(left, right)
    }
    case '+': {
      if (typeof left === 'number' && typeof right === 'number') return left + right

      return stringify(left) + stringify(right)
    }
    case '<': { return compare(left, right, (a, b) => a < b)
    }
    case '<=': { return compare(left, right, (a, b) => a <= b)
    }
    case '>': { return compare(left, right, (a, b) => a > b)
    }
    case '>=': { return compare(left, right, (a, b) => a >= b)
    }
    default: { return arithmetic(expression.op, left, right)
    }
  }
}

/** For `&&`, `||` and `??`: which side the result is, given the left value; `undefined` for other operators. */
function shortCircuitOf (op: string, left: unknown): { value: 'left' | 'right' } | undefined {
  if (op === '&&') return { value: isTruthy(left) ? 'right' : 'left' }
  if (op === '||') return { value: isTruthy(left) ? 'left' : 'right' }
  if (op === '??') return { value: left === undefined || left === null ? 'right' : 'left' }

  return undefined
}

function arithmetic (op: string, left: unknown, right: unknown): number | undefined {
  const a = toNumber(left)
  const b = toNumber(right)
  if (a === undefined || b === undefined) return undefined
  if (op === '-') return a - b
  if (op === '*') return a * b
  if (op === '/') return b === 0 ? undefined : a / b

  return b === 0 ? undefined : a % b
}

function compare (left: unknown, right: unknown, test: (a: number | string, b: number | string) => boolean): boolean {
  const a = toNumber(left)
  const b = toNumber(right)
  if (a !== undefined && b !== undefined) return test(a, b)

  return test(stringify(left), stringify(right))
}

/** Equality as recipes mean it: `3 == "3"`, `null == undefined`, otherwise by value for primitives and by JSON for data. */
function looseEqual (left: unknown, right: unknown): boolean {
  if (left === right) return true
  if ((left === undefined || left === null) && (right === undefined || right === null)) return true
  if (left === undefined || right === undefined || left === null || right === null) return false
  if (typeof left === 'object' || typeof right === 'object') return JSON.stringify(left) === JSON.stringify(right)

  return String(left) === String(right)
}

/**
 * A value as a number: numbers as they are, numeric text parsed, booleans as
 * 0 and 1; anything else (and NaN) is `undefined`.
 */
function toNumber (value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isNaN(value) ? undefined : value
  if (typeof value === 'boolean') return value ? 1 : 0
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value.trim())

    return Number.isNaN(parsed) ? undefined : parsed
  }

  return undefined
}

function roundTo (value: number | undefined, digits: number): number | undefined {
  if (value === undefined) return undefined
  const factor = 10 ** Math.trunc(digits)

  return Math.round(value * factor) / factor
}

/** Data, or `undefined` for anything callable. */
function data (value: unknown): unknown {
  return typeof value === 'function' ? undefined : value
}
