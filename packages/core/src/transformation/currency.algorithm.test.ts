import { parseCurrency } from './currency.algorithm'

describe('parseCurrency', () => {
  it('reads the amount and detects the currency from symbol or code', () => {
    expect(parseCurrency('10,00 €', 'de-DE')).toEqual({ amount: 10, currency: 'EUR' })
    expect(parseCurrency('USD 12.50')).toEqual({ amount: 12.5, currency: 'USD' })
    expect(parseCurrency('R$ 1.234,56', 'pt-BR')).toEqual({ amount: 1234.56, currency: 'BRL' })
    expect(parseCurrency('£3')).toEqual({ amount: 3, currency: 'GBP' })
  })

  it('lets an explicit code win and leaves unknown currencies unset', () => {
    expect(parseCurrency('10,00 €', 'de-DE', 'CHF')).toEqual({ amount: 10, currency: 'CHF' })
    expect(parseCurrency('42')).toEqual({ amount: 42 })
    expect(parseCurrency(9.5, undefined, 'EUR')).toEqual({ amount: 9.5, currency: 'EUR' })
  })
})
