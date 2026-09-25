import { sharedStrings } from './shared-strings.mapper'

describe('sharedStrings', () => {
  it('joins rich-text runs and leaves phonetic guides out', () => {
    expect(sharedStrings('<sst><si><t>a</t></si><si><r><t>b</t></r><r><t>c</t></r></si><si><t>東京</t><rPh><t>トウキョウ</t></rPh></si><si/></sst>')).toEqual(['a', 'bc', '東京', ''])
  })
})
