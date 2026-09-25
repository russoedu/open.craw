import { parseNumber } from './number.algorithm'

/** A money amount with its ISO 4217 code, when known. */
export interface Money {
  amount:    number
  currency?: string
}

const SYMBOLS: Record<string, string> = { '€': 'EUR', '£': 'GBP', '¥': 'JPY', '₹': 'INR', '₩': 'KRW', 'R$': 'BRL', 'US$': 'USD', 'CA$': 'CAD', 'A$': 'AUD', '$': 'USD' }
const CODE = /\b([A-Z]{3})\b/

/**
 * Parses a price. The currency comes from the explicit code, else a code or symbol in the text.
 *
 * @param value - Text such as `1.299,00 €` or a number.
 * @param locale - The locale the text is written in.
 * @param currency - An explicit ISO 4217 code that wins over anything in the text.
 * @returns The money value.
 */
export function parseCurrency (value: unknown, locale?: string, currency?: string): Money {
  const amount = parseNumber(value, locale)
  if (typeof value !== 'string') return currency === undefined ? { amount } : { amount, currency }
  const detected = currency ?? CODE.exec(value)?.[1] ?? Object.entries(SYMBOLS).find(([symbol]) => value.includes(symbol))?.[1]

  return detected === undefined ? { amount } : { amount, currency: detected }
}
