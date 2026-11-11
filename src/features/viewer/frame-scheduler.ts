/** Coalesce scene changes into one frame and cancel pending work on disposal. */
export function createFrameScheduler(
  draw: () => void,
  requestFrame: (callback: () => void) => number,
  cancelFrame: (id: number) => void,
) {
  let pending: number | null = null
  let disposed = false
  return {
    request() {
      if (disposed || pending != null) return
      pending = requestFrame(() => {
        pending = null
        if (!disposed) draw()
      })
    },
    dispose() {
      disposed = true
      if (pending != null) cancelFrame(pending)
      pending = null
    },
  }
}
