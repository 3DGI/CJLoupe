import type { Dispatch, RefObject, SetStateAction } from 'react'
import { useCallback, useEffect, useState } from 'react'
import type { ViewerDataset } from '../../types/cityjson'
import { createLatestTaskRunner } from './latest-task'

type LoadTask<T> = {
  load: (signal: AbortSignal) => Promise<T>
  apply: (value: T) => void
  message?: string | null
  fallback: string
}

export function useDatasetLoading({ pendingDataset, setError, setIsLoading, setLoadingMessage, setIsFileDialogOpen }: {
  pendingDataset: RefObject<ViewerDataset | null>
  setError: Dispatch<SetStateAction<string | null>>
  setIsLoading: Dispatch<SetStateAction<boolean>>
  setLoadingMessage: Dispatch<SetStateAction<string | null>>
  setIsFileDialogOpen: Dispatch<SetStateAction<boolean>>
}) {
  const [runner] = useState(createLatestTaskRunner)
  useEffect(() => () => runner.cancel(), [runner])
  return useCallback(async <T,>(task: LoadTask<T>) => {
    await runner.run(task.load, {
      start() {
        pendingDataset.current = null
        setIsLoading(true)
        setLoadingMessage(task.message ?? null)
        setError(null)
        setIsFileDialogOpen(false)
      },
      apply: task.apply,
      error(error) { setError(error instanceof Error ? error.message : task.fallback) },
      finish() {
        setLoadingMessage(null)
        setIsLoading(pendingDataset.current != null)
      },
    })
  }, [runner, pendingDataset, setError, setIsLoading, setLoadingMessage, setIsFileDialogOpen])
}
