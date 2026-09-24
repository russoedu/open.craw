import { parseDate, toIsoDate } from './date.algorithm'
import { TransformError } from './transform.error'

describe('parseDate', () => {
  it('reads ISO text, epoch numbers and dates', () => {
    expect(parseDate('2026-03-04T05:06:07Z').toISOString()).toBe('2026-03-04T05:06:07.000Z')
    expect(parseDate('2026-03-04').toISOString()).toBe('2026-03-04T00:00:00.000Z')
    expect(parseDate(0).toISOString()).toBe('1970-01-01T00:00:00.000Z')
    const now = new Date()
    expect(parseDate(now)).toBe(now)
  })

  it('reads a custom format and interprets it in a zone', () => {
    expect(parseDate('04/03/2026', 'DD/MM/YYYY').toISOString()).toBe('2026-03-04T00:00:00.000Z')
    expect(parseDate('2026-07-01 12:00', 'YYYY-MM-DD HH:mm', 'Europe/Berlin').toISOString()).toBe('2026-07-01T10:00:00.000Z')
    expect(parseDate('2026-01-01T12:00:00', undefined, 'America/Sao_Paulo').toISOString()).toBe('2026-01-01T15:00:00.000Z')
  })

  it('rejects unreadable text', () => {
    expect(() => parseDate('yesterday')).toThrow(TransformError)
    expect(() => parseDate('2026-13-45', 'YYYY-MM-DD')).toThrow(TransformError)
    expect(() => parseDate('x', 'DD/MM/YYYY')).toThrow(/with format DD\/MM\/YYYY/)
  })
})

describe('toIsoDate', () => {
  it('keeps the UTC calendar date', () => {
    expect(toIsoDate(new Date('2026-03-04T23:59:59Z'))).toBe('2026-03-04')
  })
})
