import { RunGate } from './run-gate.policy'

describe('RunGate', () => {
  it('lets `permits` iterations run at once and queues the rest in order', async () => {
    const gate = new RunGate(2, 0)
    const first = await gate.acquire()
    const second = await gate.acquire()
    let thirdIn = false
    const third = (async (): Promise<() => void> => {
      const release = await gate.acquire()
      thirdIn = true

      return release
    })()
    await Promise.resolve()
    expect(thirdIn).toBe(false)
    first()
    first()
    const release = await third
    expect(thirdIn).toBe(true)
    second()
    release()
    expect(gate.concurrent).toBe(true)
    expect(new RunGate(1, 0).concurrent).toBe(false)
  })

  it('spaces request starts by the minimum interval, shared with nested gates', async () => {
    const gate = new RunGate(3, 30)
    const nested = gate.nested()
    const started = Date.now()
    await gate.throttle()
    await nested.throttle()
    await gate.throttle()
    expect(Date.now() - started).toBeGreaterThanOrEqual(55)
    expect(nested.permits).toBe(1)
    await expect(new RunGate(1, 0).throttle()).resolves.toBeUndefined()
  })
})
