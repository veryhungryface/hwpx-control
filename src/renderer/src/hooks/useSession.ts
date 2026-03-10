import { useCallback, useEffect } from 'react'
import { useAppStore } from '../stores/app-store'

export function useSession() {
  const setSessions = useAppStore((s) => s.setSessions)
  const setCurrentSession = useAppStore((s) => s.setCurrentSession)
  const setMessages = useAppStore((s) => s.setMessages)
  const addSession = useAppStore((s) => s.addSession)
  const removeSession = useAppStore((s) => s.removeSession)
  const mode = useAppStore((s) => s.mode)

  useEffect(() => {
    window.api.session.list().then((sessions) => {
      setSessions(sessions)
    })
  }, [setSessions])

  const loadSession = useCallback(
    async (id: string) => {
      const result = await window.api.session.load(id)
      if (!result) return
      setCurrentSession(result.session.id)
      setMessages(result.messages)
    },
    [setCurrentSession, setMessages]
  )

  const createSession = useCallback(async () => {
    const session = await window.api.session.create({ mode })
    addSession(session)
    setCurrentSession(session.id)
    setMessages([])
  }, [mode, addSession, setCurrentSession, setMessages])

  const deleteSession = useCallback(
    async (id: string) => {
      await window.api.session.delete(id)
      removeSession(id)
    },
    [removeSession]
  )

  return { loadSession, createSession, deleteSession }
}
