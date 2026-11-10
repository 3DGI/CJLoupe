/** Invalidates stale results even when the underlying operation cannot be aborted. */
export function createLatestTaskRunner() {
  let current: AbortController | null = null
  const begin = () => {
    current?.abort()
    const controller = new AbortController()
    current = controller
    return { signal: controller.signal, isCurrent: () => current === controller && !controller.signal.aborted }
  }
  return {
    begin,
    async run<T>(load: (signal: AbortSignal) => Promise<T>, callbacks: {
      start: () => void
      apply: (value: T) => void
      error: (error: unknown) => void
      finish: () => void
    }) {
      const ticket = begin()
      callbacks.start()
      try {
        const value = await load(ticket.signal)
        if (ticket.isCurrent()) callbacks.apply(value)
      } catch (error) {
        if (ticket.isCurrent()) callbacks.error(error)
      } finally {
        if (ticket.isCurrent()) callbacks.finish()
      }
    },
    cancel() { current?.abort(); current = null },
  }
}
