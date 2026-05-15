let measureId = 0

function getPerformance() {
  const perf = globalThis.performance
  return typeof perf?.mark === 'function' && typeof perf.measure === 'function'
    ? perf
    : null
}

export function measurePerformance<T>(name: string, callback: () => T): T {
  const perf = getPerformance()
  if (!perf) {
    return callback()
  }

  const id = measureId++
  const startMark = `${name}:start:${id}`
  const endMark = `${name}:end:${id}`

  perf.mark(startMark)
  try {
    return callback()
  } finally {
    perf.mark(endMark)
    perf.measure(name, startMark, endMark)
    perf.clearMarks(startMark)
    perf.clearMarks(endMark)
  }
}

export async function measureAsyncPerformance<T>(
  name: string,
  callback: () => Promise<T>,
): Promise<T> {
  const perf = getPerformance()
  if (!perf) {
    return callback()
  }

  const id = measureId++
  const startMark = `${name}:start:${id}`
  const endMark = `${name}:end:${id}`

  perf.mark(startMark)
  try {
    return await callback()
  } finally {
    perf.mark(endMark)
    perf.measure(name, startMark, endMark)
    perf.clearMarks(startMark)
    perf.clearMarks(endMark)
  }
}
