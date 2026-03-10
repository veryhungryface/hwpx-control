import { useEffect } from 'react'
import { useAppStore } from '../stores/app-store'

export function useStreaming(): void {
  const appendStreamChunk = useAppStore((s) => s.appendStreamChunk)
  const stopStreaming = useAppStore((s) => s.stopStreaming)
  const addMessage = useAppStore((s) => s.addMessage)

  useEffect(() => {
    const unsubChunk = window.api.ai.onStreamChunk((chunk) => {
      appendStreamChunk(chunk)
    })

    const unsubComplete = window.api.ai.onChatComplete((message) => {
      addMessage(message)
      stopStreaming()
    })

    return () => {
      unsubChunk()
      unsubComplete()
    }
  }, [appendStreamChunk, stopStreaming, addMessage])
}
