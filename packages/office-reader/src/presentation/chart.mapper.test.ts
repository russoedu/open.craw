import { readChart } from './chart.mapper'

describe('readChart', () => {
  it('reads a scatter chart\'s x values as categories, a literal series name, and cached points past the last one written', () => {
    const xml = '<c:chartSpace><c:chart><c:plotArea><c:scatterChart><c:ser><c:tx><c:v>Prezzo</c:v></c:tx>' +
      '<c:xVal><c:numLit><c:ptCount val="2"/><c:pt idx="0"><c:v>1</c:v></c:pt><c:pt idx="1"><c:v>2</c:v></c:pt></c:numLit></c:xVal>' +
      '<c:yVal><c:numLit><c:ptCount val="3"/><c:pt idx="0"><c:v>10.5</c:v></c:pt></c:numLit></c:yVal></c:ser></c:scatterChart></c:plotArea></c:chart></c:chartSpace>'
    expect(readChart(xml, 'typed')).toEqual({ type: 'scatter', series: [{ name: 'Prezzo', categories: ['1', '2'], values: [10.5, null, null] }] })
  })
})
