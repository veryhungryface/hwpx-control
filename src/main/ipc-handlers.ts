import { ipcMain, BrowserWindow } from 'electron'
import { IPC, DEFAULTS } from '../shared/constants'
import type { AppSettings, EditCommand } from '../shared/types'
import { HwpService } from './services/hwp-service'
import { AiService } from './services/ai-service'
import { FileParserService } from './services/file-parser'
import type {
  SessionService,
  MessageService,
  EditHistoryService,
  SettingsService
} from './services/db'

// ─────────────────────────────────────────────────────────────
// Types mirrored from preload
// ─────────────────────────────────────────────────────────────

interface AiChatRequest {
  sessionId: string
  userMessage: string
  mode: 'edit' | 'chat'
  pageRange?: [number, number]
}

// ─────────────────────────────────────────────────────────────
// registerIpcHandlers
// ─────────────────────────────────────────────────────────────

export function registerIpcHandlers(params: {
  mainWindow: BrowserWindow
  hwpService: HwpService
  aiService: AiService
  sessions: SessionService
  messages: MessageService
  editHistory: EditHistoryService
  settings: SettingsService
}): void {
  const { mainWindow, hwpService, aiService, sessions, messages, editHistory, settings } = params

  // Shared file parser (stateless, safe to create once)
  const fileParser = new FileParserService()

  // AbortController map for in-flight AI requests keyed by sessionId
  const abortControllers = new Map<string, AbortController>()

  // ── HWP ─────────────────────────────────────────────────────

  ipcMain.handle(IPC.HWP_GET_STATUS, () => {
    return hwpService.getStatus()
  })

  ipcMain.handle(IPC.HWP_DETECT, () => {
    // Force a connect on the adapter and return the refreshed status
    const adapter = (hwpService as unknown as { adapter: { connect(): boolean; isConnected(): boolean; getCursorPos(): { page: number; paragraph: number; charIndex: number }; getTotalPages(): number; findHwpWindow(): { hwnd: number; pid: number; title: string } | null } }).adapter
    if (adapter && !adapter.isConnected()) {
      adapter.connect()
    }
    return hwpService.getStatus()
  })

  ipcMain.handle(IPC.HWP_ARRANGE_WINDOWS, (_event, layout: 'side-by-side' | 'stacked') => {
    // Convert logical layout to ratio/swap parameters
    const hwnd = mainWindow.getNativeWindowHandle().readInt32LE(0)
    const ratio = DEFAULTS.WINDOW_RATIO
    const swap = layout === 'stacked' ? true : DEFAULTS.WINDOW_SWAP
    hwpService.arrangeWindows(hwnd, ratio, swap)
  })

  ipcMain.handle(IPC.HWP_READ_DOCUMENT, async (_event, opts?: { pageRange?: [number, number] }) => {
    return await hwpService.readDocumentContext(opts?.pageRange)
  })

  ipcMain.handle(IPC.HWP_APPLY_EDITS, async (_event, edits: EditCommand[], messageId?: string) => {
    // Save snapshots to edit_history before applying
    const historyEntries = edits.map((edit, seq) => {
      const originalText = edit.action !== 'insert' ? edit.search ?? null : null
      const newText = edit.action !== 'delete' ? edit.text ?? null : null
      return editHistory.create(
        messageId ?? 'unknown',
        seq,
        edit.action,
        edit.paragraph,
        originalText ?? undefined,
        newText ?? undefined
      )
    })

    const result = await hwpService.applyEdits(edits)

    // Update edit_history statuses
    const now = new Date().toISOString()
    historyEntries.forEach((entry, idx) => {
      const failed = idx >= edits.length - result.failed
      editHistory.updateStatus(entry.id, failed ? 'rejected' : 'applied', failed ? undefined : now)
    })

    return result
  })

  ipcMain.handle(IPC.HWP_REVERT_EDITS, async (_event, editIds: string[]) => {
    // Retrieve the history entries so we can reconstruct revert commands
    const entries = editHistory.getByIds(editIds)

    // Build inverse edits: for each applied entry, invert the operation
    const revertEdits: EditCommand[] = entries
      .filter((e) => e.status === 'applied')
      .map((e): EditCommand => {
        if (e.action === 'insert') {
          // The inserted paragraph must be deleted
          return { action: 'delete', paragraph: e.paragraph }
        } else if (e.action === 'delete') {
          // Re-insert the originally deleted text
          return {
            action: 'insert',
            paragraph: e.paragraph - 1,
            text: e.originalText ?? ''
          }
        } else {
          // replace: swap new/original
          return {
            action: 'replace',
            paragraph: e.paragraph,
            search: e.newText ?? '',
            text: e.originalText ?? ''
          }
        }
      })

    const result = await hwpService.applyEdits(revertEdits)

    // Mark entries as reverted
    const now = new Date().toISOString()
    entries.forEach((entry) => {
      editHistory.updateStatus(entry.id, 'reverted', now)
    })

    return result
  })

  ipcMain.handle(IPC.HWP_ACCEPT_INLINE, async () => {
    await hwpService.acceptInlineEdits()
  })

  ipcMain.handle(IPC.HWP_REJECT_INLINE, async () => {
    await hwpService.rejectInlineEdits()
  })

  ipcMain.handle(IPC.HWP_GET_SELECTION, () => {
    return hwpService.getSelection()
  })

  // ── AI ──────────────────────────────────────────────────────

  ipcMain.handle(IPC.AI_CHAT, async (_event, req: AiChatRequest) => {
    const { sessionId, userMessage, mode, pageRange } = req

    // Cancel any existing request for this session
    const existing = abortControllers.get(sessionId)
    if (existing) {
      existing.abort()
    }
    const controller = new AbortController()
    abortControllers.set(sessionId, controller)

    try {
      // 1. Save user message to DB
      const userMsg = messages.create(sessionId, 'user', userMessage)

      // 2. Load session message history
      const history = messages.listBySession(sessionId).map((m) => ({
        role: m.role,
        content: m.content
      }))

      // 3. Read document context from HWP
      let documentContext = null
      try {
        documentContext = await hwpService.readDocumentContext(pageRange)
      } catch {
        // HWP may not be connected — proceed without context
      }

      // 4. Call aiService with streaming callback
      // Send each chunk as a plain string to match the renderer's onStreamChunk(chunk: string) API
      const result = await aiService.chat({
        messages: history,
        documentContext,
        mode,
        onChunk: (chunk: string) => {
          mainWindow.webContents.send(IPC.AI_STREAM_CHUNK, chunk)
        },
        signal: controller.signal
      })

      // 5. Save assistant message to DB
      const assistantMsg = messages.create(
        sessionId,
        'assistant',
        result.content,
        result.edits ?? undefined,
        result.inputTokens,
        result.outputTokens
      )

      // Update session timestamp
      sessions.updateTimestamp(sessionId)

      // 6. Send the persisted Message to the renderer so it can be added to the message list
      mainWindow.webContents.send(IPC.AI_CHAT_COMPLETE, assistantMsg)

      // Suppress "unused variable" warning
      void userMsg
    } catch (err) {
      if ((err as { name?: string }).name === 'AbortError') {
        // Cancelled — no-op
        return
      }
      throw err
    } finally {
      abortControllers.delete(sessionId)
    }
  })

  ipcMain.handle(IPC.AI_CANCEL, (_event, sessionId: string) => {
    const controller = abortControllers.get(sessionId)
    if (controller) {
      controller.abort()
      abortControllers.delete(sessionId)
    }
  })

  // ── Session ─────────────────────────────────────────────────

  ipcMain.handle(IPC.SESSION_LIST, () => {
    return sessions.list()
  })

  ipcMain.handle(
    IPC.SESSION_CREATE,
    (_event, opts: { mode: 'edit' | 'chat'; hwpDoc?: string }) => {
      return sessions.create(opts.mode, opts.hwpDoc)
    }
  )

  ipcMain.handle(IPC.SESSION_LOAD, (_event, id: string) => {
    const session = sessions.getById(id)
    if (!session) return null
    const msgs = messages.listBySession(id)
    return { session, messages: msgs }
  })

  ipcMain.handle(IPC.SESSION_DELETE, (_event, id: string) => {
    sessions.delete(id)
  })

  ipcMain.handle(IPC.SESSION_RENAME, (_event, id: string, title: string) => {
    sessions.rename(id, title)
  })

  // ── File ────────────────────────────────────────────────────

  ipcMain.handle(IPC.FILE_PARSE, (_event, filePath: string) => {
    return fileParser.parse(filePath)
  })

  // ── Settings ────────────────────────────────────────────────

  ipcMain.handle(IPC.SETTINGS_GET, () => {
    const raw = settings.getAll()

    // Return a full AppSettings object, filling in defaults for any missing keys
    const result: AppSettings = {
      aiProvider: (raw.aiProvider as AppSettings['aiProvider']) ?? DEFAULTS.AI_PROVIDER,
      apiKey: raw.apiKey ?? '',
      model: raw.model ?? DEFAULTS.MODEL,
      windowRatio: raw.windowRatio ? parseFloat(raw.windowRatio) : DEFAULTS.WINDOW_RATIO,
      windowSwap: raw.windowSwap ? raw.windowSwap === 'true' : DEFAULTS.WINDOW_SWAP,
      theme: (raw.theme as AppSettings['theme']) ?? DEFAULTS.THEME
    }

    return result
  })

  // Supports two calling conventions:
  //   Batch:  set({ aiProvider: 'claude', apiKey: '...', model: '...', ... })
  //   Single: set('apiKey', 'sk-...')
  ipcMain.handle(
    IPC.SETTINGS_SET,
    (
      _event,
      settingsOrKey: Partial<AppSettings> | keyof AppSettings,
      value?: string
    ) => {
      const applyKey = (key: keyof AppSettings, val: string) => {
        settings.set(key, val)

        // Side-effects: propagate AI-related changes to the service
        if (key === 'apiKey') {
          const provider =
            (settings.get('aiProvider') as 'claude' | 'openai') ?? DEFAULTS.AI_PROVIDER
          aiService.setApiKey(provider, val)
        } else if (key === 'aiProvider') {
          const existingKey = settings.get('apiKey')
          if (existingKey) {
            aiService.setApiKey(val as 'claude' | 'openai', existingKey)
          }
        } else if (key === 'model') {
          aiService.setModel(val)
        }
      }

      if (typeof settingsOrKey === 'string') {
        // Single key-value form
        applyKey(settingsOrKey, value ?? '')
      } else {
        // Batch object form
        const patch = settingsOrKey as Partial<AppSettings>
        for (const [k, v] of Object.entries(patch) as Array<[keyof AppSettings, unknown]>) {
          applyKey(k, String(v))
        }
      }
    }
  )

  // Supports two calling conventions:
  //   Object: validateKey({ provider: 'claude', apiKey: 'sk-...' })
  //   Args:   validateKey('claude', 'sk-...')
  ipcMain.handle(
    IPC.SETTINGS_VALIDATE_KEY,
    async (
      _event,
      providerOrObj: 'claude' | 'openai' | { provider: 'claude' | 'openai'; apiKey: string },
      keyArg?: string
    ) => {
      let provider: 'claude' | 'openai'
      let key: string

      if (typeof providerOrObj === 'object') {
        provider = providerOrObj.provider
        key = providerOrObj.apiKey
      } else {
        provider = providerOrObj
        key = keyArg ?? ''
      }

      if (!key || key.trim().length === 0) {
        return { valid: false, error: 'API 키가 비어 있습니다.' }
      }

      try {
        if (provider === 'claude') {
          const Anthropic = (await import('@anthropic-ai/sdk')).default
          const client = new Anthropic({ apiKey: key })
          await client.models.list({ limit: 1 })
          return { valid: true }
        } else {
          const OpenAI = (await import('openai')).default
          const client = new OpenAI({ apiKey: key })
          await client.models.list({ limit: 1 })
          return { valid: true }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        return { valid: false, error: message }
      }
    }
  )
}
