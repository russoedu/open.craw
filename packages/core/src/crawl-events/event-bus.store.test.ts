import type { CrawlEvent } from './crawl-event.contract'
import { EventBus } from './event-bus.store'

describe('EventBus', () => {
  it('stamps events and delivers them to every listener', () => {
    const seen: CrawlEvent[] = []
    const bus = new EventBus((event) => { seen.push(event) })
    bus.subscribe((event) => { seen.push(event) })
    bus.emit({ type: 'page:visit', recipeId: 'r', url: 'http://x', number: 1 })
    expect(seen).toHaveLength(2)
    expect(seen[0].type).toBe('page:visit')
    expect(Date.parse(seen[0].at)).not.toBeNaN()
  })

  it('unsubscribes and survives a throwing listener', () => {
    const seen: string[] = []
    const bus = new EventBus()
    bus.subscribe(() => { throw new Error('boom') })
    const off = bus.subscribe((event) => { seen.push(event.type) })
    bus.emit({ type: 'warning', recipeId: 'r', message: 'm' })
    off()
    bus.emit({ type: 'warning', recipeId: 'r', message: 'm' })
    expect(seen).toEqual(['warning'])
  })
})
