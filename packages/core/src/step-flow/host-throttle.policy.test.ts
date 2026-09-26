import { HostThrottle } from './host-throttle.policy'

async function startTimes (throttle: HostThrottle, urls: string[], holdMs = 0): Promise<number[]> {
  const began = Date.now()

  return Promise.all(urls.map(async (url) => {
    const release = await throttle.slot(url)
    const at = Date.now() - began
    await new Promise(resolve => setTimeout(resolve, holdMs))
    release()

    return at
  }))
}

describe('HostThrottle', () => {
  it('spaces request starts per site, not across sites', async () => {
    const times = await startTimes(new HostThrottle({ delayMs: 40 }), ['https://a.example/1', 'https://a.example/2', 'https://b.example/1'])
    expect(times[0]).toBeLessThan(20)
    expect(times[1]).toBeGreaterThanOrEqual(35)
    expect(times[2]).toBeLessThan(20)
  })

  it('bounds requests in flight per site', async () => {
    const times = await startTimes(new HostThrottle({ concurrency: 1 }), ['https://a.example/1', 'https://a.example/2'], 40)
    expect(times[1]).toBeGreaterThanOrEqual(35)
  })

  it('applies the longest matching domain rule to its subdomains, and none to other sites', async () => {
    const throttle = new HostThrottle({ domains: { 'example.com': { delayMs: 40 }, 'api.example.com': { delayMs: 0 } } })
    const times = await startTimes(throttle, ['https://www.example.com/', 'https://shop.example.com/', 'https://api.example.com/1', 'https://api.example.com/2', 'https://other.org/', 'https://other.org/'])
    expect(times[1]).toBeGreaterThanOrEqual(35)
    expect(Math.max(times[2], times[3], times[4], times[5])).toBeLessThan(20)
  })

  it('passes non-http URLs and unthrottled sites at once, and releases only once', async () => {
    const throttle = new HostThrottle({ concurrency: 1 })
    expect(new HostThrottle().active).toBe(false)
    expect(throttle.active).toBe(true)
    const release = await throttle.slot('file:///tmp/a.csv')
    release()
    const first = await throttle.slot('https://a.example/')
    first()
    first()
    const second = await throttle.slot('https://a.example/')
    const third = throttle.slot('https://a.example/')
    let got = false
    void third.then(() => { got = true })
    await new Promise(resolve => setTimeout(resolve, 10))
    expect(got).toBe(false)
    second()
    await third
  })

  it('holds a site back until a Retry-After, even without a rule', async () => {
    const throttle = new HostThrottle()
    throttle.pause('https://a.example/x', Date.now() + 40)
    const times = await startTimes(throttle, ['https://a.example/y', 'https://b.example/'])
    expect(times[0]).toBeGreaterThanOrEqual(35)
    expect(times[1]).toBeLessThan(20)
  })
})
