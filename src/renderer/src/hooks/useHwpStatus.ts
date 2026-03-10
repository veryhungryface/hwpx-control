import { useEffect } from 'react'
import { useAppStore } from '../stores/app-store'

export function useHwpStatus(): void {
  const setHwpStatus = useAppStore((s) => s.setHwpStatus)

  useEffect(() => {
    // Initial fetch
    window.api.hwp.getStatus().then((status) => {
      setHwpStatus(status)
    })

    // Subscribe to status changes
    const unsubscribe = window.api.hwp.onStatusChanged((status) => {
      setHwpStatus(status)
    })

    return () => {
      unsubscribe()
    }
  }, [setHwpStatus])
}
