import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/constants'
import type {
  HwpStatus,
  DocumentContext,
  EditCommand,
  ApplyEditsResult,
  Session,
  Message,
  AppSettings,
  ValidateKeyResult,
  FileParseResult
} from '../shared/types'

// ─────────────────────────────────────────────────────────────
// AI chat request / response types (mirrored from ipc-handlers)
// ─────────────────────────────────────────────────────────────

export interface AiChatRequest {
  sessionId: string
  userMessage: string
  mode: 'edit' | 'chat'
  pageRange?: [number, number]
}

export interface AiStreamChunkData {
  sessionId: string
  chunk: string
}

// ─────────────────────────────────────────────────────────────
// Exposed API
// ─────────────────────────────────────────────────────────────

const api = {
  hwp: {
    getStatus: (): Promise<HwpStatus> =>
      ipcRenderer.invoke(IPC.HWP_GET_STATUS),

    detect: (): Promise<HwpStatus> =>
      ipcRenderer.invoke(IPC.HWP_DETECT),

    arrangeWindows: (layout: 'side-by-side' | 'stacked'): Promise<void> =>
      ipcRenderer.invoke(IPC.HWP_ARRANGE_WINDOWS, layout),

    readDocument: (opts?: { pageRange?: [number, number] }): Promise<DocumentContext> =>
      ipcRenderer.invoke(IPC.HWP_READ_DOCUMENT, opts),

    applyEdits: (edits: EditCommand[], messageId?: string): Promise<ApplyEditsResult> =>
      ipcRenderer.invoke(IPC.HWP_APPLY_EDITS, edits, messageId),

    revertEdits: (editIds: string[]): Promise<ApplyEditsResult> =>
      ipcRenderer.invoke(IPC.HWP_REVERT_EDITS, editIds),

    acceptInline: (): Promise<void> =>
      ipcRenderer.invoke(IPC.HWP_ACCEPT_INLINE),

    rejectInline: (): Promise<void> =>
      ipcRenderer.invoke(IPC.HWP_REJECT_INLINE),

    getSelection: (): Promise<{ text: string } | null> =>
      ipcRenderer.invoke(IPC.HWP_GET_SELECTION),

    onStatusChanged: (callback: (status: HwpStatus) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, status: HwpStatus) => callback(status)
      ipcRenderer.on(IPC.HWP_STATUS_CHANGED, handler)
      return () => ipcRenderer.removeListener(IPC.HWP_STATUS_CHANGED, handler)
    }
  },

  ai: {
    chat: (req: AiChatRequest): Promise<void> =>
      ipcRenderer.invoke(IPC.AI_CHAT, req),

    cancel: (sessionId: string): Promise<void> =>
      ipcRenderer.invoke(IPC.AI_CANCEL, sessionId),

    // Delivers the raw text chunk as a string for direct appending in the renderer
    onStreamChunk: (callback: (chunk: string) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, chunk: string) => callback(chunk)
      ipcRenderer.on(IPC.AI_STREAM_CHUNK, handler)
      return () => ipcRenderer.removeListener(IPC.AI_STREAM_CHUNK, handler)
    },

    // Delivers the fully persisted Message so the renderer can add it to the message list
    onChatComplete: (callback: (message: Message) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, message: Message) => callback(message)
      ipcRenderer.on(IPC.AI_CHAT_COMPLETE, handler)
      return () => ipcRenderer.removeListener(IPC.AI_CHAT_COMPLETE, handler)
    }
  },

  session: {
    list: (): Promise<Session[]> =>
      ipcRenderer.invoke(IPC.SESSION_LIST),

    create: (opts: { mode: 'edit' | 'chat'; hwpDoc?: string }): Promise<Session> =>
      ipcRenderer.invoke(IPC.SESSION_CREATE, opts),

    load: (id: string): Promise<{ session: Session; messages: Message[] } | null> =>
      ipcRenderer.invoke(IPC.SESSION_LOAD, id),

    delete: (id: string): Promise<void> =>
      ipcRenderer.invoke(IPC.SESSION_DELETE, id),

    rename: (id: string, title: string): Promise<void> =>
      ipcRenderer.invoke(IPC.SESSION_RENAME, id, title)
  },

  file: {
    parse: (filePath: string): Promise<FileParseResult> =>
      ipcRenderer.invoke(IPC.FILE_PARSE, filePath)
  },

  settings: {
    // Returns all persisted settings. Unknown keys are omitted so callers should handle partials.
    get: (): Promise<AppSettings> =>
      ipcRenderer.invoke(IPC.SETTINGS_GET),

    // Accepts either a full/partial settings object (batch) or individual key-value pairs.
    // The renderer currently calls the batch form: set({ aiProvider, apiKey, model, ... })
    set: (settingsOrKey: Partial<AppSettings> | keyof AppSettings, value?: string): Promise<void> =>
      ipcRenderer.invoke(IPC.SETTINGS_SET, settingsOrKey, value),

    // Accepts either an object { provider, apiKey } or two positional args (provider, key).
    validateKey: (
      providerOrObj: 'claude' | 'openai' | { provider: 'claude' | 'openai'; apiKey: string },
      key?: string
    ): Promise<ValidateKeyResult> =>
      ipcRenderer.invoke(IPC.SETTINGS_VALIDATE_KEY, providerOrObj, key)
  }
}

contextBridge.exposeInMainWorld('api', api)

export type ElectronApi = typeof api
