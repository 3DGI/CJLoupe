import { useCallback, useEffect, useRef, useState } from 'react'
import type { ViewerShareStateV1 } from '../../lib/viewer-state'
import { createViewerShareOutput, getViewerShareMode } from '../../lib/viewer-state'
import type { ViewerDataset } from '../../types/cityjson'

export function useViewerSharing(dataset: ViewerDataset | null, snapshot: () => ViewerShareStateV1, onError: (error: string | null) => void) {
  const [isSharing, setIsSharing] = useState(false)
  const [shareStatus, setShareStatus] = useState('')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mounted = useRef(false)
  const busy = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false; if (timer.current != null) clearTimeout(timer.current) }
  }, [])
  const handleShare = useCallback(async () => {
    if (!dataset || busy.current) return
    busy.current = true
    setIsSharing(true)
    onError(null)
    try {
      const output = await createViewerShareOutput(dataset, snapshot(), window.location.href)
      if (!mounted.current) return
      if (output.kind === 'url') await navigator.clipboard.writeText(output.url)
      else downloadBlob(output.data, output.name)
      if (!mounted.current) return
      setShareStatus(output.kind === 'url' ? 'Share link copied.' : output.kind === 'file' ? 'View file downloaded.' : 'View bundle downloaded.')
      if (timer.current != null) clearTimeout(timer.current)
      timer.current = setTimeout(() => setShareStatus(''), 2000)
    } catch (error) {
      if (mounted.current) onError(error instanceof Error ? error.message : 'Could not share the current view.')
    } finally {
      busy.current = false
      if (mounted.current) setIsSharing(false)
    }
  }, [dataset, snapshot, onError])
  const shareMode = dataset ? getViewerShareMode(dataset) : null
  const shareActionLabel = shareMode === null ? 'Share view' : shareMode === 'url' ? 'Copy share link' : shareMode === 'file' ? 'Download view file' : 'Download view bundle'
  const didCopyShareLink = shareStatus === 'Share link copied.'
  return { isSharing, shareStatus, shareMode, shareActionLabel, didCopyShareLink, shareButtonLabel: didCopyShareLink ? 'Share link copied' : shareActionLabel, handleShare }
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
