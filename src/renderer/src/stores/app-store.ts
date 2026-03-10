import { create } from 'zustand'
import type { Session, Message, HwpStatus } from '../../../shared/types'

interface AppStore {
  // HWP
  hwpStatus: HwpStatus
  setHwpStatus: (status: HwpStatus) => void

  // Sessions
  sessions: Session[]
  currentSessionId: string | null
  setSessions: (sessions: Session[]) => void
  setCurrentSession: (id: string | null) => void
  addSession: (session: Session) => void
  removeSession: (id: string) => void

  // Messages
  messages: Message[]
  setMessages: (messages: Message[]) => void
  addMessage: (message: Message) => void
  updateMessage: (id: string, updates: Partial<Message>) => void

  // Streaming
  streamingContent: string
  isStreaming: boolean
  appendStreamChunk: (chunk: string) => void
  startStreaming: () => void
  stopStreaming: () => void

  // Mode
  mode: 'edit' | 'chat'
  setMode: (mode: 'edit' | 'chat') => void

  // Settings modal
  showSettings: boolean
  setShowSettings: (show: boolean) => void
}

export const useAppStore = create<AppStore>((set) => ({
  // HWP
  hwpStatus: {
    connected: false,
    hwpVersion: null,
    docName: null,
    cursorPage: null,
    totalPages: null
  },
  setHwpStatus: (status) => set({ hwpStatus: status }),

  // Sessions
  sessions: [],
  currentSessionId: null,
  setSessions: (sessions) => set({ sessions }),
  setCurrentSession: (id) => set({ currentSessionId: id }),
  addSession: (session) =>
    set((state) => ({ sessions: [session, ...state.sessions] })),
  removeSession: (id) =>
    set((state) => ({
      sessions: state.sessions.filter((s) => s.id !== id),
      currentSessionId: state.currentSessionId === id ? null : state.currentSessionId,
      messages: state.currentSessionId === id ? [] : state.messages
    })),

  // Messages
  messages: [],
  setMessages: (messages) => set({ messages }),
  addMessage: (message) =>
    set((state) => ({ messages: [...state.messages, message] })),
  updateMessage: (id, updates) =>
    set((state) => ({
      messages: state.messages.map((m) =>
        m.id === id ? { ...m, ...updates } : m
      )
    })),

  // Streaming
  streamingContent: '',
  isStreaming: false,
  appendStreamChunk: (chunk) =>
    set((state) => ({ streamingContent: state.streamingContent + chunk })),
  startStreaming: () => set({ isStreaming: true, streamingContent: '' }),
  stopStreaming: () => set({ isStreaming: false, streamingContent: '' }),

  // Mode
  mode: 'edit',
  setMode: (mode) => set({ mode }),

  // Settings modal
  showSettings: false,
  setShowSettings: (show) => set({ showSettings: show })
}))
