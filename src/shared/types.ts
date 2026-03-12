// ──────────────────────────────────────
// 공유 타입 — Main과 Renderer 모두에서 사용
// ──────────────────────────────────────

// === 세션 ===

export interface Session {
  id: string
  title: string
  mode: 'edit' | 'chat'
  hwpDoc: string | null
  createdAt: string
  updatedAt: string
}

// === 메시지 ===

export interface Message {
  id: string
  sessionId: string
  role: 'user' | 'assistant' | 'system'
  content: string
  edits: EditCommand[] | null
  editStatus: EditStatus
  tokenInput: number | null
  tokenOutput: number | null
  createdAt: string
}

export type EditStatus = 'none' | 'pending' | 'previewing' | 'accepted' | 'rejected' | 'partial'

// === 편집 명령 ===

export interface EditCommand {
  action: 'insert' | 'replace' | 'delete'
  paragraph: number
  search?: string // replace 시: 문단 내 찾을 문자열
  text?: string // insert/replace 시: 새 텍스트
}

// === 편집 이력 ===

export interface EditHistoryEntry {
  id: string
  messageId: string
  seq: number
  action: 'insert' | 'replace' | 'delete'
  paragraph: number
  originalText: string | null
  newText: string | null
  status: 'pending' | 'applied' | 'reverted' | 'rejected'
  appliedAt: string | null
}

// === HWP 상태 ===

export interface HwpStatus {
  connected: boolean
  hwpVersion: string | null
  docName: string | null
  cursorPage: number | null
  totalPages: number | null
}

// === 문서 컨텍스트 ===

export interface DocumentContext {
  pageRange: [number, number]
  paragraphs: NumberedParagraph[]
  totalParagraphs: number
}

export interface NumberedParagraph {
  index: number // 1-based 문단 번호
  text: string
  page: number
}

// === Diff ===

export interface DiffResult {
  original: string
  modified: string
  hunks: DiffHunk[]
}

export interface DiffHunk {
  type: 'add' | 'remove' | 'equal'
  value: string
}

// === 첨부 파일 ===

export interface Attachment {
  id: string
  messageId: string
  filename: string
  mimeType: string
  sizeBytes: number
  textPreview: string | null
  createdAt: string
}

// === 설정 ===

export interface AppSettings {
  aiProvider: 'claude' | 'openai'
  apiKey: string
  model: string
  windowRatio: number
  windowSwap: boolean
  theme: 'light' | 'dark'
}

// === IPC 응답 타입 ===

export interface ApplyEditsResult {
  applied: number
  failed: number
  errors: string[]
}

export interface FileParseResult {
  text: string
  truncated: boolean
  originalLength: number
}

export interface ValidateKeyResult {
  valid: boolean
  error?: string
}
