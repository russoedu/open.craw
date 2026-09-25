import { parseJsonLike, parseJsonLines, tryParseJson } from './json-text.algorithm'

describe('parseJsonLike', () => {
  it('reads valid JSON as it is, even when it looks like a wrapper', () => {
    expect(parseJsonLike('")]}\'"')).toEqual({ value: ")]}'" })
    expect(parseJsonLike('{"a":1}')).toEqual({ value: { a: 1 } })
  })

  it.each([
    ['an anti-hijacking prefix', ")]}'\n{\"a\":1}"],
    ['the same with a comma', ")]}',\n{\"a\":1}"],
    ['while(1);', 'while(1);{"a":1}'],
    ['for(;;);', 'for(;;);{"a":1}'],
    ['a JSONP call', 'jQuery3510_1712({"a":1});'],
    ['a namespaced JSONP call', 'cb.handlers.done ( {"a":1} )'],
    ['an assignment', 'window.__INITIAL_STATE__ = {"a":1};'],
    ['a declaration', 'var state = {"a":1}'],
    ['comment guards', '<!-- {"a":1} -->'],
  ])('unwraps %s', (_label, text) => {
    expect(parseJsonLike(text)).toEqual({ value: { a: 1 } })
  })

  it('never evaluates: a wrapper around something that is not JSON still fails', () => {
    expect(parseJsonLike('callback({a: 1})')).toMatchObject({ error: expect.any(SyntaxError) })
    expect(parseJsonLike('window.x = { a: undefined };')).toMatchObject({ error: expect.any(SyntaxError) })
    expect(tryParseJson('not json')).toBeUndefined()
  })
})

describe('parseJsonLines', () => {
  it('reads one value per non-blank line, CRLF or LF', () => {
    expect(parseJsonLines('{"a":1}\r\n\r\n{"a":2}\n[3]\n', 'x')).toEqual([{ a: 1 }, { a: 2 }, [3]])
  })

  it('names the line that does not parse', () => {
    expect(() => parseJsonLines('{"a":1}\n{"a":\n', 'export.jsonl')).toThrow(/export\.jsonl: line 2 is not JSON/)
  })
})
