// IPC 채널 이름 상수

export const IPC = {
  // HWP
  HWP_GET_STATUS: 'hwp:get-status',
  HWP_DETECT: 'hwp:detect',
  HWP_ARRANGE_WINDOWS: 'hwp:arrange-windows',
  HWP_READ_DOCUMENT: 'hwp:read-document',
  HWP_APPLY_EDITS: 'hwp:apply-edits',
  HWP_REVERT_EDITS: 'hwp:revert-edits',
  HWP_ACCEPT_INLINE: 'hwp:accept-inline',
  HWP_REJECT_INLINE: 'hwp:reject-inline',
  HWP_GET_SELECTION: 'hwp:get-selection',
  HWP_STATUS_CHANGED: 'hwp:status-changed',

  // AI
  AI_CHAT: 'ai:chat',
  AI_STREAM_CHUNK: 'ai:stream-chunk',
  AI_CHAT_COMPLETE: 'ai:chat-complete',
  AI_CANCEL: 'ai:cancel',

  // 세션
  SESSION_LIST: 'session:list',
  SESSION_CREATE: 'session:create',
  SESSION_LOAD: 'session:load',
  SESSION_DELETE: 'session:delete',
  SESSION_RENAME: 'session:rename',

  // 파일
  FILE_PARSE: 'file:parse',

  // 설정
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',
  SETTINGS_VALIDATE_KEY: 'settings:validate-key'
} as const

// 기본 설정값
export const DEFAULTS = {
  AI_PROVIDER: 'openai' as const,
  MODEL: 'gpt-4o',
  WINDOW_RATIO: 0.5,
  WINDOW_SWAP: false,
  THEME: 'light' as const,

  // HWP 감지 폴링 주기 (ms)
  HWP_POLL_INTERVAL: 2000,

  // 선택 텍스트 폴링 주기 (ms)
  SELECTION_POLL_INTERVAL: 500,

  // 문서 컨텍스트 페이지 범위 (±N 페이지)
  CONTEXT_PAGE_RANGE: 5,

  // 토큰 버짓 (입력)
  TOKEN_BUDGET: 50_000,

  // 파일 파싱 최대 글자수
  FILE_MAX_CHARS: 50_000,

  // DB 파일명
  DB_FILENAME: 'hwp-ai-assistant.db'
} as const
