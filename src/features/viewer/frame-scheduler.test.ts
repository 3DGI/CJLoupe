import { expect, test } from 'bun:test'
import { createFrameScheduler } from './frame-scheduler'

function frames() {
  let id = 0
  const callbacks = new Map<number, () => void>()
  return {
    callbacks,
    request(callback: () => void) { callbacks.set(++id, callback); return id },
    cancel(id: number) { callbacks.delete(id) },
    flush() {
      const pending = [...callbacks.values()]
      callbacks.clear()
      for (const callback of pending) callback()
    },
  }
}

test('selection, overlays and colour previews draw once with the latest state', () => {
  const clock = frames(), drawn: number[] = []
  let state = 0
  const scheduler = createFrameScheduler(() => drawn.push(state), clock.request, clock.cancel)
  for (state = 1; state <= 3; state++) scheduler.request()
  expect(drawn).toEqual([])
  expect(clock.callbacks.size).toBe(1)
  state = 3
  clock.flush()
  expect(drawn).toEqual([3])
  state = 4
  scheduler.request()
  clock.flush()
  expect(drawn).toEqual([3, 4])
})

test('changes requested during drawing schedule another frame; disposal cancels pending work', () => {
  const clock = frames()
  let draws = 0
  const scheduler = createFrameScheduler(() => { draws++; scheduler.request() }, clock.request, clock.cancel)
  scheduler.request()
  clock.flush()
  expect(draws).toBe(1)
  expect(clock.callbacks.size).toBe(1)
  scheduler.dispose()
  scheduler.request()
  clock.flush()
  expect(draws).toBe(1)
  expect(clock.callbacks.size).toBe(0)
})
