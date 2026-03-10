# HWP AI Assistant — TODO

> PRD 기반 구현 체크리스트. 크리티컬 패스: Phase 0 → Phase 2 → Phase 4.

---

## Phase 0 — COM PoC 검증 (착수 전 필수, 2~3일)

> **이 단계를 통과하지 못하면 전체 접근법 재검토 필요.**

- [ ] Python(`win32com`)으로 `CoCreateInstance("HWPFrame.HwpObject")` 성공 확인
- [ ] `Open`으로 HWP 파일 열기 확인
- [ ] `GetTextFile("TEXT", "")` 로 문서 전체 텍스트 읽기 확인
- [ ] `GetPos()` / `SetPos()` 커서 위치 조회 및 이동 확인
- [ ] `HAction.Run("InsertText")`로 텍스트 삽입 후 문서 반영 확인
- [ ] 위 5개 항목 모두 성공 시 Phase 1 진행, 실패 시 클립보드 폴백 또는 범위 축소 결정

---

## 1. 프로젝트 초기화

### 1-1. Electron 프로젝트 생성
- [ ] `npm create electron-vite@latest hwp-ai-assistant -- --template react-ts` 실행
- [ ] `src/shared/` 디렉토리 수동 생성 (`types.ts`, `constants.ts` 배치 예정)
- [ ] `electron-vite.config.ts`에서 `shared/` 경로를 메인/렌더러 양쪽 tsconfig `paths`에 추가

### 1-2. 의존성 설치
- [ ] 런타임 의존성 설치
  - `zustand` (5.x)
  - `tailwindcss` (4.x)
  - `better-sqlite3` (11+)
  - `diff` (jsdiff 7+)
  - `react-markdown` (9+)
  - `@anthropic-ai/sdk` (최신)
  - `nanoid`
  - `pdf-parse`
  - `mammoth`
  - `jszip`
  - `iconv-lite`
  - `electron-store`
  - `electron-log`
- [ ] 개발 의존성 설치
  - `cmake-js`
  - `node-addon-api`
  - `vitest`
  - `playwright` (E2E용)
  - `@types/better-sqlite3`
  - `@types/pdf-parse`

### 1-3. TypeScript 설정
- [ ] `tsconfig.json` (루트): `paths`에 `@shared/*` → `src/shared/*` 매핑 추가
- [ ] `src/main/tsconfig.json`: Node.js 타입, `paths` 상속 확인
- [ ] `src/renderer/tsconfig.json`: DOM 타입, `paths` 상속 확인
- [ ] `src/preload/tsconfig.json`: 별도 설정 확인

### 1-4. Tailwind CSS 설정
- [ ] `src/renderer/src/styles/globals.css` 생성 — Tailwind `@import` 지시어 추가
- [ ] `tailwind.config.ts` 생성 — `content` 경로를 렌더러 소스 기준으로 설정
- [ ] CSS 변수로 라이트/다크 테마 색상 토큰 정의 (`--bg-primary`, `--text-primary` 등)
- [ ] `renderer/index.html`에서 `globals.css` import 확인

### 1-5. C++ Native Addon 세팅
- [ ] `native/CMakeLists.txt` 작성 — cmake-js, N-API, ole32/oleaut32 링크 설정
- [ ] `native/src/addon.cpp` 생성 — N-API 모듈 진입점, 함수 등록 스텁
- [ ] `native/src/window_manager.cpp` / `.h` 생성 — `FindHwpWindow` 스텁
- [ ] `native/src/hwp_com.cpp` / `.h` 생성 — `HwpCom` 클래스 스텁
- [ ] `native/src/event_hook.cpp` / `.h` 생성 — `SetWinEventHook` 래퍼 스텁
- [ ] `package.json`의 `scripts`에 `build:native` 항목 추가 (`cmake-js build`)
- [ ] macOS 개발 환경에서 native addon 없이 앱이 기동될 수 있도록 조건부 import 처리

---

## 2. 공유 타입 & 상수 (`src/shared/`)

### 2-1. `src/shared/types.ts`
- [ ] `Session` 인터페이스 정의
  - `id: string`, `title: string`, `mode: 'edit' | 'chat'`
  - `hwpDoc: string | null`, `createdAt: string`, `updatedAt: string`
- [ ] `Message` 인터페이스 정의
  - `id`, `sessionId`, `role: 'user' | 'assistant' | 'system'`
  - `content`, `edits: EditCommand[] | null`
  - `editStatus: 'none' | 'pending' | 'accepted' | 'rejected' | 'partial'`
  - `tokenInput: number | null`, `tokenOutput: number | null`, `createdAt`
- [ ] `EditCommand` 인터페이스 정의
  - `action: 'insert' | 'replace' | 'delete'`
  - `paragraph: number`
  - `search?: string`, `text?: string`
- [ ] `HwpStatus` 인터페이스 정의
  - `connected: boolean`, `hwpVersion: string | null`
  - `docName: string | null`, `cursorPage: number | null`, `totalPages: number | null`
- [ ] `DocumentContext` 인터페이스 정의
  - `pageRange: [number, number]`, `paragraphs: NumberedParagraph[]`, `totalParagraphs: number`
- [ ] `NumberedParagraph` 인터페이스 정의
  - `index: number`, `text: string`, `page: number`
- [ ] `DiffResult` 인터페이스 정의
  - `original: string`, `modified: string`, `hunks: DiffHunk[]`
- [ ] `DiffHunk` 인터페이스 정의
  - `type: 'add' | 'remove' | 'equal'`, `value: string`
- [ ] `ElectronAPI` 인터페이스 정의 (preload 타입 안전성용)

### 2-2. `src/shared/constants.ts`
- [ ] HWP IPC 채널명 상수 정의
  - `HWP_GET_STATUS`, `HWP_DETECT`, `HWP_ARRANGE_WINDOWS`
  - `HWP_READ_DOCUMENT`, `HWP_APPLY_EDITS`, `HWP_REVERT_EDITS`
  - `HWP_GET_SELECTION`, `HWP_STATUS_CHANGED`
- [ ] AI IPC 채널명 상수 정의
  - `AI_CHAT`, `AI_STREAM_CHUNK`, `AI_CHAT_COMPLETE`, `AI_CANCEL`
- [ ] 세션 IPC 채널명 상수 정의
  - `SESSION_LIST`, `SESSION_CREATE`, `SESSION_LOAD`, `SESSION_DELETE`, `SESSION_RENAME`
- [ ] 파일 IPC 채널명 상수 정의
  - `FILE_PARSE`
- [ ] 설정 IPC 채널명 상수 정의
  - `SETTINGS_GET`, `SETTINGS_SET`, `SETTINGS_VALIDATE_KEY`
- [ ] 기본값 상수 정의
  - `DEFAULT_MODEL: 'claude-sonnet-4-5'`
  - `DEFAULT_WINDOW_RATIO: 0.5`
  - `HWP_POLL_INTERVAL_MS: 2000`
  - `SELECTION_POLL_INTERVAL_MS: 500`
  - `MAX_FILE_CHARS: 50000`
  - `TOKEN_BUDGET_INPUT: 50000`
  - `CONTEXT_PAGE_RADIUS: 5`

---

## 3. 데이터베이스 (`src/main/services/db.ts`)

### 3-1. SQLite 초기화
- [ ] `better-sqlite3`로 DB 파일 열기 — 경로: `app.getPath('userData')/hwp-ai.db`
- [ ] WAL 모드 활성화: `PRAGMA journal_mode=WAL`
- [ ] Foreign keys 활성화: `PRAGMA foreign_keys=ON`
- [ ] 마이그레이션 버전 관리 구조 설계 (단순 버전 테이블 또는 파일 기반)

### 3-2. 테이블 생성 DDL
- [ ] `sessions` 테이블 생성 SQL 작성 및 실행
  - `id TEXT PK`, `title`, `mode`, `hwp_doc`, `created_at`, `updated_at`
- [ ] `messages` 테이블 생성 SQL 작성 및 실행
  - `id TEXT PK`, `session_id FK`, `role`, `content`, `edits_json`
  - `edit_status`, `token_input`, `token_output`, `created_at`
  - `idx_messages_session` 인덱스 생성
- [ ] `edit_history` 테이블 생성 SQL 작성 및 실행
  - `id TEXT PK`, `message_id FK`, `seq`, `action`, `paragraph`
  - `original_text`, `new_text`, `status`, `applied_at`
  - `idx_edit_message` 인덱스 생성
- [ ] `settings` 테이블 생성 SQL 작성 및 실행
  - `key TEXT PK`, `value TEXT`
- [ ] `attachments` 테이블 생성 SQL 작성 및 실행
  - `id TEXT PK`, `message_id FK`, `filename`, `mime_type`
  - `size_bytes`, `text_preview`, `created_at`

### 3-3. SessionService CRUD
- [ ] `createSession(opts: { mode, hwpDoc? })` → `Session` 구현 (nanoid 사용)
- [ ] `listSessions()` → `Session[]` 구현 (updated_at DESC 정렬)
- [ ] `getSession(id)` → `Session | null` 구현
- [ ] `updateSession(id, patch)` 구현 (title 수정, updated_at 갱신)
- [ ] `deleteSession(id)` 구현 (CASCADE 삭제 확인)

### 3-4. MessageService CRUD
- [ ] `createMessage(msg)` → `Message` 구현
- [ ] `listMessages(sessionId)` → `Message[]` 구현 (created_at ASC)
- [ ] `updateMessageEditStatus(id, status)` 구현
- [ ] `deleteMessage(id)` 구현

### 3-5. EditHistoryService CRUD
- [ ] `createEditHistory(entries: EditHistoryEntry[])` 구현
- [ ] `listEditHistory(messageId)` → `EditHistoryEntry[]` 구현
- [ ] `updateEditStatus(id, status, appliedAt?)` 구현
- [ ] `getEditHistoryForRevert(editIds)` 구현

### 3-6. SettingsService get/set
- [ ] `getSetting(key)` → `string | null` 구현
- [ ] `getAllSettings()` → `Record<string, string>` 구현
- [ ] `setSetting(key, value)` 구현 (upsert)
- [ ] API 키 암호화 저장: `safeStorage.encryptString` 연동 (`electron` import)

---

## 4. HWP 서비스 (`src/main/services/hwp-service.ts`)

### 4-1. HWP 어댑터 인터페이스 정의
- [ ] `IHwpAdapter` 인터페이스 정의
  - `detect(): Promise<{ found: boolean; pid: number | null }>`
  - `getStatus(): Promise<HwpStatus>`
  - `readDocument(opts?): Promise<DocumentContext>`
  - `getParagraphText(paragraphIndex: number): Promise<string>`
  - `applyEdit(edit: EditCommand, original: string): Promise<void>`
  - `getSelectedText(): Promise<string | null>`

### 4-2. Mock 어댑터 구현 (macOS/CI 개발용)
- [ ] `MockHwpAdapter` 클래스 구현 (`IHwpAdapter` 구현)
  - `detect()` → 항상 `{ found: false, pid: null }` 반환
  - `getStatus()` → 연결 안 됨 상태 반환
  - `readDocument()` → 테스트용 더미 문단 데이터 반환
  - 나머지 메서드 → no-op 또는 더미 응답

### 4-3. Win32 어댑터 스텁 (Windows에서 실제 구현)
- [ ] `Win32HwpAdapter` 클래스 스텁 생성 (`IHwpAdapter` 구현)
  - `native/` addon 조건부 로드 (`process.platform === 'win32'`)
  - `detect()` → `addon.findHwpWindow()` 호출
  - `getStatus()` → COM으로 `hwpVersion`, `docName`, `cursorPage`, `totalPages` 읽기
  - `readDocument()` → COM `GetTextFile` + 문단 파싱 + 페이지 윈도우 계산 (±5페이지)
  - `getParagraphText(idx)` → COM으로 특정 문단 텍스트 읽기
  - `applyEdit()` → 아래 4-5 참고
  - `getSelectedText()` → COM `GetSelectedText` 호출

### 4-4. HwpService 클래스
- [ ] 플랫폼에 따라 `Win32HwpAdapter` 또는 `MockHwpAdapter` 선택 주입
- [ ] `startPolling()` — 2초 간격으로 `detect()` 호출, 상태 변경 시 `webContents.send('hwp:status-changed', status)` 전송
- [ ] `stopPolling()` — 폴링 타이머 정리
- [ ] `startSelectionPolling()` — 500ms 간격, 선택 텍스트 변경 시 이벤트 전송
- [ ] `readDocumentContext()` — 커서 기준 ±5페이지 텍스트 획득 + `NumberedParagraph` 배열 변환
- [ ] `parseParagraphs(rawText, startPage)` — `\r\n` 분리, 빈 문단 포함 번호 부여
- [ ] `applyEdits(edits)` — **뒤→앞 순서**(`paragraph` DESC)로 정렬 후 순차 적용
- [ ] 충돌 감지: 적용 전 `getParagraphText()` 재조회 → 스냅샷 불일치 시 에러 throw
- [ ] `revertEdits(editIds)` — `edit_history`에서 `original_text` 조회 후 복원 (뒤→앞 순)

### 4-5. COM을 통한 편집 실행 (`Win32HwpAdapter`)
- [ ] `replace` 구현: `FindText(search)` → 선택 → `HAction.Run("InsertText", text)`
- [ ] `insert` 구현: 지정 문단 끝으로 `SetPos` 이동 → `InsertText("\r\n" + text)`
- [ ] `delete` 구현: 문단 시작~다음 문단 시작 블록 선택 → `HAction.Run("Delete")`

### 4-6. WindowManagerService (창 배치)
- [ ] `arrangeWindows(layout: { ratio, swap })` 구현
  - Windows: `MonitorFromWindow` → `GetMonitorInfo` → `SetWindowPos` (HWP + Electron)
  - Mock(macOS): no-op, 콘솔 로그만 출력
  - `swap=true` 시 HWP 오른쪽, Electron 왼쪽

---

## 5. AI 서비스 (`src/main/services/ai-service.ts`)

### 5-1. Claude API 연동 (스트리밍)
- [ ] `@anthropic-ai/sdk` 클라이언트 초기화 — API 키는 `SettingsService`에서 런타임 조회
- [ ] `streamChat(req)` 구현
  - `anthropic.messages.stream()` 호출
  - 청크마다 `webContents.send('ai:stream-chunk', { sessionId, chunk, done: false })`
  - 완료 시 `done: true` 전송 후 `ai:chat-complete` 전송
- [ ] 진행 중인 스트림을 `Map<sessionId, AbortController>` 로 관리
- [ ] `cancelStream(sessionId)` — `AbortController.abort()` 호출

### 5-2. 시스템 프롬프트 빌더
- [ ] `buildEditModePrompt(ctx: DocumentContext)` → 편집 모드 시스템 프롬프트 문자열 반환
  - `{startPage}`, `{endPage}`, `{totalPages}`, `{numberedParagraphs}` 치환
  - `[P1]`, `[P2]` 형식 문단 번호 포맷
- [ ] `buildChatModePrompt(ctx: DocumentContext)` → 대화 모드 시스템 프롬프트 반환
  - `<edit>` 태그 사용 금지 지시 포함

### 5-3. 편집 명령 파서
- [ ] `parseEditCommands(response: string)` → `{ text: string; edits: EditCommand[] | null }` 구현
  - `/<edit>([\s\S]*?)<\/edit>/` 정규식으로 블록 추출
  - `<edit>` 없으면 `edits: null` 반환
  - JSON 파싱 실패 시 에러 없이 `edits: null` 폴백
- [ ] EditCommand 유효성 검증
  - `action`: `'insert' | 'replace' | 'delete'` 화이트리스트
  - `paragraph`: 양의 정수
  - `search`, `text`: 최대 길이 제한(예: 10,000자)

### 5-4. 토큰 카운트 (근사치)
- [ ] `estimateTokens(text: string)` → 한국어 기준 `text.length / 2` 근사치 반환
- [ ] 응답 완료 시 실제 `usage.input_tokens`, `usage.output_tokens` DB에 저장

### 5-5. 대화 이력 관리 (토큰 버짓 내)
- [ ] `buildMessageHistory(sessionId, budget = 50000)` 구현
  - 최신 메시지부터 역순으로 포함, 토큰 합산이 `budget`에 근접할 때까지
  - 시스템 메시지 제외 후 `[{ role, content }]` 배열 반환

---

## 6. 파일 파서 (`src/main/services/file-parser.ts`)

- [ ] `parseFile(filePath: string)` → `{ text: string; truncated: boolean; originalLength: number }` 구현
  - 확장자 기준으로 파서 선택 (`.pdf`, `.docx`, `.hwpx`, `.txt`, `.csv`)
- [ ] **PDF 파싱**: `pdf-parse` 로 텍스트 레이어 추출
- [ ] **DOCX 파싱**: `mammoth.extractRawText()` 사용
- [ ] **HWPX 파싱**: `jszip`으로 압축 해제 → `Contents/section*.xml` 파싱 → `<t>` 태그 텍스트 추출
- [ ] **TXT/CSV 읽기**: `iconv-lite`로 인코딩 감지 (`euc-kr` 폴백 포함) 후 UTF-8 변환
- [ ] **대용량 파일 절단**: `MAX_FILE_CHARS(50000)` 초과 시 앞부분 절단 + `truncated: true` 반환
- [ ] 지원하지 않는 확장자 → 명확한 에러 메시지 throw

---

## 7. IPC 핸들러 (`src/main/ipc-handlers.ts`)

### 7-1. HWP 관련 핸들러
- [ ] `ipcMain.handle(HWP_GET_STATUS)` → `hwpService.adapter.getStatus()` 결과 반환
- [ ] `ipcMain.handle(HWP_DETECT)` → `hwpService.adapter.detect()` 결과 반환
- [ ] `ipcMain.handle(HWP_ARRANGE_WINDOWS)` → `windowManagerService.arrangeWindows(layout)` 호출
- [ ] `ipcMain.handle(HWP_READ_DOCUMENT)` → `hwpService.readDocumentContext(opts)` 결과 반환
- [ ] `ipcMain.handle(HWP_APPLY_EDITS)` → `hwpService.applyEdits(edits)` 실행, `edit_history` DB 저장
- [ ] `ipcMain.handle(HWP_REVERT_EDITS)` → `hwpService.revertEdits(editIds)` 실행
- [ ] `ipcMain.handle(HWP_GET_SELECTION)` → `hwpService.adapter.getSelectedText()` 결과 반환

### 7-2. AI 관련 핸들러
- [ ] `ipcMain.handle(AI_CHAT)` → `aiService.streamChat(req)` 호출 (응답은 이벤트로)
- [ ] `ipcMain.handle(AI_CANCEL)` → `aiService.cancelStream(sessionId)` 호출

### 7-3. 세션 관련 핸들러
- [ ] `ipcMain.handle(SESSION_LIST)` → `sessionService.listSessions()` 결과 반환
- [ ] `ipcMain.handle(SESSION_CREATE)` → `sessionService.createSession(opts)` 결과 반환
- [ ] `ipcMain.handle(SESSION_LOAD)` → `session` + `messages` 함께 반환
- [ ] `ipcMain.handle(SESSION_DELETE)` → `sessionService.deleteSession(id)` 실행
- [ ] `ipcMain.handle(SESSION_RENAME)` → `sessionService.updateSession(id, { title })` 실행

### 7-4. 파일 관련 핸들러
- [ ] `ipcMain.handle(FILE_PARSE)` → `fileParser.parseFile(filePath)` 결과 반환

### 7-5. 설정 관련 핸들러
- [ ] `ipcMain.handle(SETTINGS_GET)` → `settingsService.getAllSettings()` 반환 (API 키 원문 노출 금지)
- [ ] `ipcMain.handle(SETTINGS_SET)` → `settingsService.setSetting(key, value)` 실행
- [ ] `ipcMain.handle(SETTINGS_VALIDATE_KEY)` → 실제 API 호출로 키 유효성 검증 후 `{ valid, error? }` 반환

---

## 8. Preload (`src/preload/index.ts`)

- [ ] `contextBridge.exposeInMainWorld('api', { ... })` 호출
- [ ] **HWP API 노출**
  - `hwp.getStatus()` → `ipcRenderer.invoke(HWP_GET_STATUS)`
  - `hwp.detect()` → `ipcRenderer.invoke(HWP_DETECT)`
  - `hwp.arrangeWindows(layout)` → `ipcRenderer.invoke(HWP_ARRANGE_WINDOWS, layout)`
  - `hwp.readDocument(opts?)` → `ipcRenderer.invoke(HWP_READ_DOCUMENT, opts)`
  - `hwp.applyEdits(edits)` → `ipcRenderer.invoke(HWP_APPLY_EDITS, edits)`
  - `hwp.revertEdits(editIds)` → `ipcRenderer.invoke(HWP_REVERT_EDITS, editIds)`
  - `hwp.getSelection()` → `ipcRenderer.invoke(HWP_GET_SELECTION)`
  - `hwp.onStatusChanged(cb)` → 리스너 등록 + **unsubscribe 함수 반환** 패턴
- [ ] **AI API 노출**
  - `ai.chat(req)` → `ipcRenderer.invoke(AI_CHAT, req)`
  - `ai.cancel(sessionId)` → `ipcRenderer.invoke(AI_CANCEL, sessionId)`
  - `ai.onStreamChunk(cb)` → 리스너 등록 + unsubscribe 반환
  - `ai.onChatComplete(cb)` → 리스너 등록 + unsubscribe 반환
- [ ] **Session API 노출**
  - `session.list()`, `session.create(opts)`, `session.load(id)`, `session.delete(id)`, `session.rename(id, title)`
- [ ] **File API 노출**
  - `file.parse(filePath)` → `ipcRenderer.invoke(FILE_PARSE, filePath)`
- [ ] **Settings API 노출**
  - `settings.get()`, `settings.set(key, value)`, `settings.validateKey(provider, key)`
- [ ] 이벤트 리스너 등록/해제 패턴 통일: `ipcRenderer.on` 등록 시 클린업 함수 반환 (`off` 호출)
- [ ] `window.api` 타입을 `ElectronAPI` 인터페이스로 선언 (`src/renderer/src/env.d.ts`)

---

## 9. Renderer — 스토어 (`src/renderer/src/stores/`)

### `app-store.ts` (Zustand)
- [ ] **HWP 상태 슬라이스**
  - `hwpStatus: HwpStatus` 초기값 (미연결)
  - `setHwpStatus(status)` 액션
- [ ] **세션 슬라이스**
  - `sessions: Session[]`
  - `currentSessionId: string | null`
  - `setSessions(sessions)`, `setCurrentSession(id)` 액션
- [ ] **메시지 슬라이스**
  - `messages: Message[]`
  - `setMessages(messages)` 액션
  - `updateMessageEditStatus(id, status)` 액션
- [ ] **스트리밍 슬라이스**
  - `streamingContent: string`
  - `isStreaming: boolean`
  - `appendStreamChunk(chunk)` 액션
  - `finalizeStream(message: Message)` 액션 — `streamingContent` 초기화 + `messages`에 최종 메시지 추가
- [ ] **모드 슬라이스**
  - `mode: 'edit' | 'chat'`
  - `setMode(mode)` 액션
- [ ] **설정 슬라이스**
  - `settings: Record<string, string>`
  - `setSettings(settings)` 액션

---

## 10. Renderer — UI 컴포넌트 (`src/renderer/src/components/`)

### 10-1. `App.tsx`
- [ ] 전체 레이아웃: `Sidebar` (좌, 200px 고정) + `ChatArea` (우, flex-1) flex 배치
- [ ] 앱 초기화: `useEffect`로 `session.list()` 호출, `hwp.onStatusChanged` 리스너 등록
- [ ] `SettingsModal` 조건부 렌더링

### 10-2. `Sidebar.tsx`
- [ ] 세션 목록 렌더링 (`sessions` 스토어 구독)
- [ ] 현재 세션 하이라이트
- [ ] 세션 클릭 → `session.load(id)` 호출 → 메시지 로드
- [ ] `+ 새 대화` 버튼 → `session.create({ mode })` 호출
- [ ] 세션 우클릭 컨텍스트 메뉴 또는 hover 시 삭제/이름변경 버튼
- [ ] `⚙ 설정` 버튼 → `SettingsModal` 열기

### 10-3. `ChatArea.tsx`
- [ ] `HwpStatusBar` + `MessageList` + `InputArea` 수직 배치 (flex-col, h-full)

### 10-4. `HwpStatusBar.tsx`
- [ ] `hwpStatus`에 따라 세 가지 상태 표시
  - 연결됨: 녹색 원 + "HWP 연결됨" + `docName` + `cursorPage/totalPages`
  - 미연결: 회색 원 + "HWP를 실행해주세요"
  - 재연결 중: 주황 원 + 펄스 애니메이션
- [ ] "창 배치" 버튼 → `hwp.arrangeWindows({ ratio: 0.5, swap: false })` 호출

### 10-5. `MessageList.tsx`
- [ ] 메시지 배열 순회, role에 따라 `UserMessage` / `AssistantMessage` 렌더링
- [ ] 스트리밍 중 `streamingContent`를 임시 `AssistantMessage`로 표시
- [ ] 새 메시지 도착 시 자동 스크롤-to-bottom (`useEffect` + `ref`)
- [ ] 빈 메시지 목록 시 빈 상태 안내 텍스트 표시

### 10-6. `UserMessage.tsx`
- [ ] 사용자 메시지 버블 (우측 정렬, 배경 강조)
- [ ] 첨부 파일 있을 경우 파일명 + 아이콘 표시

### 10-7. `AssistantMessage.tsx`
- [ ] `react-markdown`으로 마크다운 렌더링
- [ ] `edits`가 있을 경우 `DiffViewer` 렌더링
- [ ] 스트리밍 중 타이핑 커서 애니메이션 표시 (`isStreaming && message.id === lastId`)

### 10-8. `DiffViewer.tsx`
- [ ] `EditCommand` 배열 수신, 각 명령마다 Diff 섹션 렌더링
- [ ] `jsdiff`의 `diffWords(original, modified)` 로 `DiffHunk` 계산
  - `add` → `bg-green-100 text-green-800`
  - `remove` → `bg-red-100 text-red-800 line-through`
  - `equal` → 기본 스타일
- [ ] 각 편집 명령에 "수락" / "거절" 버튼 (개별 처리, P1)
- [ ] 상단에 "전체 수락" / "전체 거절" 버튼
- [ ] "전체 수락" → `hwp.applyEdits(edits)` 호출 → `updateMessageEditStatus(id, 'accepted')`
- [ ] "전체 거절" → `updateMessageEditStatus(id, 'rejected')`
- [ ] `edit_status`가 `accepted` / `rejected` 면 버튼 비활성화 + 상태 뱃지 표시

### 10-9. `InputArea.tsx`
- [ ] `textarea` (자동 높이 조절, `rows` 최소 1 ~ 최대 8)
- [ ] `Enter` → 전송, `Shift+Enter` → 줄바꿈
- [ ] `Ctrl+.` → `ai.cancel(sessionId)` 호출 (전역 단축키)
- [ ] 전송 버튼 → `ai.chat({ sessionId, userMessage, mode })` 호출
- [ ] `isStreaming` 중 입력창 및 전송 버튼 비활성화
- [ ] 파일 드래그&드롭 영역 (`onDrop`, `onDragOver`)
  - 드롭 된 파일 경로 → `file.parse(filePath)` 호출
  - 파싱된 텍스트를 `userMessage`에 첨부 컨텍스트로 포함
  - 파일명 + 크기 칩 표시, 제거 버튼
- [ ] 편집 모드 / 대화 모드 토글 버튼 (하단 바 또는 입력창 상단)

### 10-10. `SettingsModal.tsx`
- [ ] 모달 오버레이 + 카드 레이아웃
- [ ] API 키 입력 (password 타입, 마스킹)
- [ ] "검증" 버튼 → `settings.validateKey('claude', key)` 호출 → 성공/실패 표시
- [ ] 모델 선택 드롭다운 (`claude-sonnet-4-5`, `claude-opus-4-5` 등)
- [ ] 창 배치 비율 선택 (50/50, 60/40, 70/30)
- [ ] 좌우 반전 토글
- [ ] 테마 선택 (라이트/다크, P2)
- [ ] "저장" 버튼 → `settings.set()` 호출
- [ ] "닫기" 버튼 / ESC 키 / 오버레이 클릭으로 닫기
- [ ] 첫 실행 감지 시 자동으로 SettingsModal 열기 (API 키 미설정 상태)

---

## 11. Renderer — 훅 (`src/renderer/src/hooks/`)

### `useHwpStatus.ts`
- [ ] `api.hwp.onStatusChanged` 리스너 등록 (`useEffect`)
- [ ] 상태 변경 시 `setHwpStatus(status)` 호출
- [ ] 컴포넌트 언마운트 시 unsubscribe 클린업
- [ ] 초기 마운트 시 `api.hwp.getStatus()` 폴링으로 초기값 설정

### `useStreaming.ts`
- [ ] `api.ai.onStreamChunk` 리스너 등록
  - `done: false` → `appendStreamChunk(chunk)`
  - `done: true` → 별도 처리 없음 (complete 이벤트 대기)
- [ ] `api.ai.onChatComplete` 리스너 등록 → `finalizeStream(message)`
- [ ] 컴포넌트 언마운트 시 양쪽 리스너 모두 unsubscribe

### `useSession.ts`
- [ ] `loadSession(id)` — `api.session.load(id)` 호출 → `setMessages(messages)`, `setCurrentSession(id)`
- [ ] `createSession(opts)` — `api.session.create(opts)` → `setSessions` 갱신 + 새 세션 로드
- [ ] `deleteSession(id)` — `api.session.delete(id)` → 목록 갱신, 현재 세션이면 초기화

---

## 12. 메인 프로세스 진입점 (`src/main/index.ts`)

- [ ] `BrowserWindow` 생성
  - `width: 480`, `height: 800` (기본)
  - `contextIsolation: true`, `nodeIntegration: false`
  - `preload` 경로 설정
  - CSP 헤더: `script-src 'self'`
- [ ] `webSecurity: true` (기본값 유지 명시)
- [ ] DB 초기화 — `db.initialize()` 호출 (앱 `ready` 이벤트에서)
- [ ] 모든 IPC 핸들러 등록 — `registerIpcHandlers(mainWindow, services)` 호출
- [ ] HWP 감지 폴링 시작 — `hwpService.startPolling(mainWindow.webContents)`
- [ ] 앱 종료 시 클린업 — `hwpService.stopPolling()`, DB 닫기
- [ ] `electron-log` 초기화 — 레벨, 파일 경로, 로테이션 설정
- [ ] `app.on('second-instance')` 핸들러 — 단일 인스턴스 강제
- [ ] Windows 빌드 시 `requestedExecutionLevel: requireAdministrator` 매니페스트 설정 확인

---

## 13. 스타일 & 테마 (`src/renderer/src/styles/globals.css`)

- [ ] Tailwind CSS 기본 `@import` 설정
- [ ] `:root` CSS 변수로 라이트 테마 색상 토큰 정의
  - `--bg-primary`, `--bg-secondary`, `--bg-surface`
  - `--text-primary`, `--text-secondary`, `--text-muted`
  - `--border`, `--accent`, `--accent-hover`
  - `--diff-add-bg`, `--diff-add-text`
  - `--diff-remove-bg`, `--diff-remove-text`
  - `--status-connected`, `--status-disconnected`, `--status-reconnecting`
- [ ] `[data-theme="dark"]` 또는 `.dark` 셀렉터로 다크 테마 변수 오버라이드 (P2)
- [ ] 커스텀 스크롤바 스타일 (채팅 영역, 세션 목록)
- [ ] Diff 뷰어 전용 스타일 클래스 정의

---

## 14. 테스트 (`tests/`)

### 14-1. Unit 테스트

#### `tests/unit/edit-parser.test.ts`
- [ ] `parseEditCommands` — `<edit>` 태그 정상 파싱 검증
- [ ] `parseEditCommands` — `<edit>` 없는 응답 → `edits: null` 검증
- [ ] `parseEditCommands` — JSON 파싱 실패 → 에러 없이 `edits: null` 폴백 검증
- [ ] `parseEditCommands` — `action` 필드 잘못된 값 → 유효성 검증 실패 검증
- [ ] `parseEditCommands` — `paragraph` 0 또는 음수 → 유효성 검증 실패 검증
- [ ] `parseEditCommands` — 복수 편집 명령 올바르게 파싱 검증

#### `tests/unit/diff.test.ts`
- [ ] `computeDiff` — 단어 교체 → `remove` + `add` 헝크 생성 검증
- [ ] `computeDiff` — 동일 텍스트 → `equal` 헝크만 생성 검증
- [ ] `computeDiff` — 빈 original → 전체 `add` 검증
- [ ] `computeDiff` — 빈 modified → 전체 `remove` 검증
- [ ] 편집 명령 뒤→앞 정렬 로직 검증 (`applyEdits` 정렬 부분 단위 테스트)

### 14-2. Integration 테스트

#### `tests/integration/session-service.test.ts`
- [ ] 테스트용 in-memory SQLite DB 설정
- [ ] `createSession` → `listSessions`에 반영 검증
- [ ] `deleteSession` → 관련 `messages`, `edit_history` CASCADE 삭제 검증
- [ ] `updateSession` → `updated_at` 갱신 검증
- [ ] `createMessage` → `listMessages`에 반영 검증
- [ ] `updateMessageEditStatus` → 상태 변경 반영 검증

#### `tests/integration/ai-service.test.ts` (모킹)
- [ ] `@anthropic-ai/sdk` 모킹 설정
- [ ] `streamChat` — 스트리밍 청크 순서대로 수신 검증
- [ ] `streamChat` — 편집 명령 파싱 후 DB 저장 검증
- [ ] `cancelStream` — 진행 중 스트림 중단 검증

### 14-3. E2E 테스트

#### `tests/e2e/chat-flow.test.ts`
- [ ] Playwright + Electron 환경 설정
- [ ] 새 세션 생성 → 메시지 전송 → 스트리밍 응답 수신 시나리오
- [ ] 편집 명령 파싱 → DiffViewer 표시 → "전체 수락" 클릭 시나리오 (Mock 어댑터 사용)
- [ ] 세션 전환 → 대화 이력 복원 시나리오

---

## 15. 빌드 & 배포 (`Phase 6`)

### 15-1. electron-builder 설정
- [ ] `electron-builder.yml` 작성
  - 타깃: NSIS (Windows), productName, appId 설정
  - Native Addon: `extraResources`에 프리빌트 `.node` 파일 포함
  - `requestedExecutionLevel: requireAdministrator` 설정
- [ ] `npm run build` 스크립트 확인 (메인/프리로드/렌더러 번들)
- [ ] `npx electron-builder` NSIS 인스톨러 생성 테스트

### 15-2. 에러 처리 & 복구
- [ ] HWP 프로세스 종료 감지 → 상태 "끊김" 전환 + 재시작 감지 시 자동 재연결 (3회)
- [ ] COM 연결 실패 → 3회 재시도 → 실패 시 UI 안내 메시지
- [ ] AI API 429/500 에러 → 지수 백오프 재시도 (최대 3회)
- [ ] API 키 만료/무효 → 설정 모달로 자동 유도
- [ ] SQLite 파일 손상 → 백업 복구 시도, 실패 시 빈 DB 초기화 + 안내

### 15-3. 로깅
- [ ] `electron-log` 설정 — 레벨별 출력, 파일 경로 `%APPDATA%/hwp-ai-assistant/logs/`
- [ ] 최대 5MB, 7일 로테이션 설정
- [ ] COM 호출 실패, AI API 에러, IPC 타임아웃을 `error` 레벨로 기록

### 15-4. 보안 점검
- [ ] API 키 `safeStorage.encryptString` 암호화 저장 확인
- [ ] Renderer에서 API 키 원문 접근 불가 확인
- [ ] `contextIsolation: true`, `nodeIntegration: false` 설정 확인
- [ ] CSP 헤더 `script-src 'self'` 적용 확인
- [ ] 문서 텍스트 AI API 전송에 대한 사용자 동의 UI (첫 실행 시)

---

## MVP 완료 기준

> **핵심 시나리오:** HWP에서 문서를 열고, 앱에서 "3번 문단을 경어체로 바꿔줘"라고 입력하면, AI가 Diff를 생성하고, "수락"을 누르면 HWP 문서에 실제로 반영된다.

- [ ] Phase 0: COM PoC 5개 항목 모두 성공
- [ ] Phase 1: `npm run dev` → Electron 앱 실행, HWP 감지/상태 표시 동작
- [ ] Phase 2: 10페이지 문단 텍스트 배열 획득, 창 자동 배치 동작
- [ ] Phase 3: AI 스트리밍 채팅, 편집 명령 파싱, 세션 관리 동작
- [ ] Phase 4: Diff 미리보기 → 전체 수락 → HWP 문서 반영 동작
