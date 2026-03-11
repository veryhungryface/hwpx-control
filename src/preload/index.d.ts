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

export interface AiChatRequest {
  sessionId: string
  userMessage: string
  mode: 'edit' | 'chat'
  pageRange?: [number, number]
}


declare global {
  interface Window {
    api: {
      hwp: {
        getStatus(): Promise<HwpStatus>
        detect(): Promise<HwpStatus>
        arrangeWindows(layout: 'side-by-side' | 'stacked'): Promise<void>
        readDocument(opts?: { pageRange?: [number, number] }): Promise<DocumentContext>
        applyEdits(edits: EditCommand[], messageId?: string): Promise<ApplyEditsResult>
        revertEdits(editIds: string[]): Promise<ApplyEditsResult>
        acceptInline(): Promise<void>
        rejectInline(): Promise<void>
        getSelection(): Promise<{ text: string } | null>
        onStatusChanged(callback: (status: HwpStatus) => void): () => void
      }
      ai: {
        chat(req: AiChatRequest): Promise<void>
        cancel(sessionId: string): Promise<void>
        /** Callback receives raw text chunk strings for streaming display */
        onStreamChunk(callback: (chunk: string) => void): () => void
        /** Callback receives the fully persisted Message after generation completes */
        onChatComplete(callback: (message: Message) => void): () => void
      }
      session: {
        list(): Promise<Session[]>
        create(opts: { mode: 'edit' | 'chat'; hwpDoc?: string }): Promise<Session>
        load(id: string): Promise<{ session: Session; messages: Message[] } | null>
        delete(id: string): Promise<void>
        rename(id: string, title: string): Promise<void>
      }
      file: {
        parse(filePath: string): Promise<FileParseResult>
      }
      settings: {
        get(): Promise<AppSettings>
        set(
          settingsOrKey: Partial<AppSettings> | keyof AppSettings,
          value?: string
        ): Promise<void>
        validateKey(
          providerOrObj: 'claude' | 'openai' | { provider: 'claude' | 'openai'; apiKey: string },
          key?: string
        ): Promise<ValidateKeyResult>
      }
    }
  }
}
