import { probeTool } from './probe-tool.handler'

describe('probeTool', () => {
  it('returns an error result rather than throwing when the fetch fails', async () => {
    const result = await probeTool({ url: 'http://127.0.0.1:1/unreachable' })
    expect(result.isError).toBe(true)
    expect((result.content[0] as { text: string }).text).toContain('probe failed')
  })
})
