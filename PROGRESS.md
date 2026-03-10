# HWP AI Assistant — 진행 상태 체크리스트

> PRD 기준 구현 현황. 체크된 항목은 코드가 작성되어 빌드를 통과한 상태.
> 마지막 업데이트: 2026-03-10

---

## Phase 0 — COM PoC 검증 (착수 전 필수)

- [ ] Python으로 `CoCreateInstance("HWPFrame.HwpObject")` 성공 확인
- [ ] `Open`으로 HWP 파일 열기 확인
- [ ] `GetTextFile("TEXT", "")` 텍스트 읽기 확인
- [ ] `GetPos()` / `SetPos()` 커서 위치 조회/이동 확인
- [ ] `HAction.Run("InsertText")` 텍스트 삽입 확인
- [ ] 합/불합 판정 및 대안 결정

> **상태: 미착수** — Windows 환경 필요. 현재 macOS에서 개발 중이므로 Mock으로 우회.

---

## Phase 1 — 프로젝트 세팅 & HWP 감지

### 프로젝트 초기화
- [x] Electron + TypeScript + React 프로젝트 구성 (electron-vite)
- [x] 메인/프리로드/렌더러 3계층 디렉토리 구조
- [x] `electron-vite.config.ts` 설정
- [x] `tsconfig.json` (루트 + node + web 분리)
- [x] `package.json` 스크립트 (dev, build, test)

### 의존성
- [x] zustand, tailwindcss, better-sqlite3, diff, react-markdown
- [x] @anthropic-ai/sdk, nanoid, pdf-parse, mammoth, jszip
- [x] electron-store
- [x] @types/better-sqlite3, @types/diff, @types/pdf-parse
- [x] vitest (설정만, 테스트 미작성)
- [ ] electron-log (미설치)
- [ ] cmake-js, node-addon-api (C++ 빌드 도구 — Windows에서 필요)
- [ ] playwright (E2E 테스트 프레임워크)

### Tailwind CSS
- [x] `tailwind.config.js` (content 경로, 커스텀 색상 토큰)
- [x] `postcss.config.js`
- [x] `globals.css` (Tailwind 지시어 + 커스텀 스크롤바)

### C++ Native Addon
- [ ] `native/CMakeLists.txt`
- [ ] `native/src/addon.cpp` (N-API 진입점)
- [ ] `native/src/window_manager.cpp` / `.h`
- [ ] `native/src/hwp_com.cpp` / `.h`
- [ ] `native/src/event_hook.cpp` / `.h`

> **상태: Native Addon 제외하고 완료.** macOS에서 Mock 어댑터로 대체.

---

## Phase 2 — 공유 타입 & 상수

### `src/shared/types.ts`
- [x] `Session` 인터페이스
- [x] `Message` 인터페이스
- [x] `EditCommand` 인터페이스
- [x] `EditStatus` 타입
- [x] `EditHistoryEntry` 인터페이스
- [x] `HwpStatus` 인터페이스
- [x] `DocumentContext` 인터페이스
- [x] `NumberedParagraph` 인터페이스
- [x] `DiffResult`, `DiffHunk` 인터페이스
- [x] `Attachment` 인터페이스
- [x] `AppSettings` 인터페이스
- [x] `ApplyEditsResult`, `FileParseResult`, `ValidateKeyResult` 응답 타입

### `src/shared/constants.ts`
- [x] IPC 채널명 상수 (HWP 8개, AI 4개, Session 5개, File 1개, Settings 3개)
- [x] 기본값 상수 (DEFAULTS 객체)

> **상태: 완료**

---

## Phase 3 — 데이터베이스

### SQLite 초기화 (`src/main/services/db.ts`)
- [x] `better-sqlite3`로 DB 파일 열기
- [x] WAL 모드 활성화
- [x] Foreign keys 활성화
- [ ] 마이그레이션 버전 관리 (현재 CREATE IF NOT EXISTS로 처리)

### 테이블 생성
- [x] `sessions` 테이블 (id, title, mode, hwp_doc, created_at, updated_at)
- [x] `messages` 테이블 (id, session_id FK, role, content, edits, edit_status, token_input, token_output)
- [x] `edit_history` 테이블 (id, message_id FK, seq, action, paragraph, original_text, new_text, status, applied_at)
- [x] `settings` 테이블 (key, value)
- [x] `attachments` 테이블 (id, message_id FK, filename, mime_type, size_bytes, text_preview)
- [x] 인덱스 생성 (idx_messages_session, idx_messages_created, idx_edit_message, idx_edit_seq, idx_sessions_updated)

### SessionService
- [x] `create(mode, hwpDoc?)` — nanoid, 자동 제목 "새 대화"
- [x] `list()` — updatedAt DESC 정렬
- [x] `getById(id)`
- [x] `rename(id, title)`
- [x] `delete(id)` — CASCADE 삭제
- [x] `updateTimestamp(id)`

### MessageService
- [x] `create(sessionId, role, content, edits?, tokenInput?, tokenOutput?)`
- [x] `listBySession(sessionId)` — createdAt ASC
- [x] `updateEditStatus(id, status)`
- [x] `delete(id)`

### EditHistoryService
- [x] `create(messageId, seq, action, paragraph, originalText?, newText?)`
- [x] `listByMessage(messageId)`
- [x] `updateStatus(id, status, appliedAt?)`
- [x] `getByIds(ids[])`

### SettingsService
- [x] `get(key)`
- [x] `set(key, value)` — UPSERT
- [x] `getAll()`
- [ ] API 키 암호화 저장 (safeStorage.encryptString) — 현재 평문 저장

> **상태: 암호화 제외 완료**

---

## Phase 4 — HWP 서비스

### HWP 어댑터 인터페이스 (`src/main/services/hwp-adapter.ts`)
- [x] `IHwpAdapter` 인터페이스 정의 (13개 메서드)
- [x] `MockHwpAdapter` 구현 (24문단 샘플 한국어 문서)
  - [x] `findHwpWindow()` — Mock 결과 반환
  - [x] `connect()` / `disconnect()` / `isConnected()`
  - [x] `getFullText()` — 전체 텍스트 반환
  - [x] `getCursorPos()` — Mock 위치 반환
  - [x] `getTotalPages()` — 페이지 수 계산
  - [x] `getTextRange(startPage, endPage)` — 페이지 범위 텍스트
  - [x] `getSelectedText()` — null 반환
  - [x] `getParagraphText(index)` — 특정 문단 반환
  - [x] `insertAfterParagraph()` — 내부 상태 변경
  - [x] `findAndReplace()` — 내부 상태 변경
  - [x] `deleteParagraph()` — 내부 상태 변경
  - [x] `arrangeWindows()` — 콘솔 로그
- [ ] `Win32HwpAdapter` 구현 (Windows 전용 — 미착수)

### HwpService (`src/main/services/hwp-service.ts`)
- [x] 어댑터 주입 생성자
- [x] `getStatus()` — 현재 상태 반환
- [x] `startPolling(intervalMs, onStatusChange)` — 2초 간격, 상태 변경 감지
- [x] `stopPolling()` — 타이머 정리
- [x] `readDocumentContext(pageRange?)` — ±5페이지 기본
- [x] `parseParagraphs(rawText, startPage)` — 줄 분리, 1-based 번호, 페이지 추정
- [x] `applyEdits(edits)` — **뒤→앞 정렬 후 적용**, 에러 수집
- [x] `getSelection()` — 선택 텍스트 반환
- [x] `arrangeWindows()` — 어댑터 위임
- [ ] 선택 텍스트 폴링 (500ms 간격) — 미구현
- [ ] 편집 충돌 감지 (적용 전 스냅샷 비교) — 미구현

> **상태: Win32 어댑터, 선택 폴링, 충돌 감지 제외 완료**

---

## Phase 5 — AI 서비스

### AiService (`src/main/services/ai-service.ts`)
- [x] Claude API 클라이언트 초기화 (`@anthropic-ai/sdk`)
- [x] `setApiKey(provider, key)` — 런타임 키 변경
- [x] `setModel(model)` — 런타임 모델 변경
- [x] `chat()` — 스트리밍, onChunk 콜백, AbortSignal 지원
- [x] 입출력 토큰 카운트 반환

### 시스템 프롬프트 빌더
- [x] `buildEditModePrompt(context)` — 한국어 편집 지시 + [P1][P2] 문단 번호
- [x] `buildChatModePrompt(context)` — 한국어 대화 지시 + 편집 금지
- [x] 문단 포맷: `[P{index}] {text}` / `[P{index}] (빈 줄)`
- [x] 문서 미연결 시 폴백 프롬프트

### 편집 명령 파서
- [x] `parseEditCommands(response)` — static 메서드
- [x] `<edit>` 태그 정규식 추출
- [x] JSON 파싱 + 유효성 검증 (action, paragraph)
- [x] 파싱 실패 시 edits: null 폴백

### 토큰 관리
- [x] `estimateTokens(text)` — `Math.ceil(text.length / 3)` 근사치
- [x] 토큰 버짓 체크 (50,000 입력 토큰)
- [ ] 대화 이력 토큰 버짓 관리 (오래된 메시지 잘라내기) — 미구현

> **상태: 대화 이력 토큰 관리 제외 완료**

---

## Phase 6 — 파일 파서

### FileParserService (`src/main/services/file-parser.ts`)
- [x] `parse(filePath)` — 확장자 기반 파서 선택
- [x] PDF 파싱 (`pdf-parse`)
- [x] DOCX 파싱 (`mammoth`)
- [x] HWPX 파싱 (`jszip` + `<hp:t>` 태그 추출)
- [x] TXT/CSV/MD/JSON/XML 읽기 (UTF-8)
- [x] 대용량 파일 절단 (50,000자 + truncated 플래그)
- [x] 미지원 확장자 에러 메시지
- [ ] 인코딩 감지 (EUC-KR 폴백) — 미구현, UTF-8 고정

> **상태: 인코딩 감지 제외 완료**

---

## Phase 7 — IPC 핸들러

### `src/main/ipc-handlers.ts`
- [x] `registerIpcHandlers()` 함수 — 모든 서비스 주입 받아 등록

#### HWP 관련
- [x] `HWP_GET_STATUS` 핸들러
- [x] `HWP_DETECT` 핸들러
- [x] `HWP_ARRANGE_WINDOWS` 핸들러
- [x] `HWP_READ_DOCUMENT` 핸들러
- [x] `HWP_APPLY_EDITS` 핸들러 — edit_history 스냅샷 저장 포함
- [x] `HWP_REVERT_EDITS` 핸들러 — edit_history에서 원본 복원
- [x] `HWP_GET_SELECTION` 핸들러

#### AI 관련
- [x] `AI_CHAT` 핸들러 — 메시지 저장 → 문서 읽기 → 스트리밍 → 완료 메시지 전송
- [x] `AI_CANCEL` 핸들러 — AbortController 맵 기반 취소

#### 세션 관련
- [x] `SESSION_LIST` 핸들러
- [x] `SESSION_CREATE` 핸들러
- [x] `SESSION_LOAD` 핸들러 (session + messages)
- [x] `SESSION_DELETE` 핸들러
- [x] `SESSION_RENAME` 핸들러

#### 파일 관련
- [x] `FILE_PARSE` 핸들러

#### 설정 관련
- [x] `SETTINGS_GET` 핸들러 — 기본값 채우기 포함
- [x] `SETTINGS_SET` 핸들러 — apiKey/provider/model 변경 시 AiService에 전파
- [x] `SETTINGS_VALIDATE_KEY` 핸들러

> **상태: 완료**

---

## Phase 8 — Preload

### `src/preload/index.ts`
- [x] `contextBridge.exposeInMainWorld('api', { ... })`
- [x] HWP API (getStatus, detect, arrangeWindows, readDocument, applyEdits, revertEdits, getSelection, onStatusChanged)
- [x] AI API (chat, cancel, onStreamChunk, onChatComplete)
- [x] Session API (list, create, load, delete, rename)
- [x] File API (parse)
- [x] Settings API (get, set, validateKey)
- [x] 이벤트 리스너 unsubscribe 함수 반환 패턴

### `src/preload/index.d.ts`
- [x] `window.api` 전역 타입 선언

> **상태: 완료**

---

## Phase 9 — 메인 프로세스 진입점

### `src/main/index.ts`
- [x] BrowserWindow 생성 (480x720, contextIsolation, nodeIntegration:false)
- [x] Preload 스크립트 경로 설정
- [x] DB 초기화 (app.getPath('userData'))
- [x] MockHwpAdapter + HwpService 초기화
- [x] AiService 초기화 + 저장된 API 키/모델 복원
- [x] IPC 핸들러 등록
- [x] HWP 감지 폴링 시작 (2초 간격)
- [x] 개발 모드: ELECTRON_RENDERER_URL 로드
- [x] 프로덕션 모드: index.html 로드
- [ ] electron-log 초기화 (미설치)
- [ ] 단일 인스턴스 강제 (app.requestSingleInstanceLock)
- [ ] CSP 헤더 설정 (script-src 'self')

> **상태: 로깅, 단일 인스턴스, CSP 제외 완료**

---

## Phase 10 — Zustand 스토어

### `src/renderer/src/stores/app-store.ts`
- [x] HWP 상태: `hwpStatus`, `setHwpStatus`
- [x] 세션: `sessions`, `currentSessionId`, `setSessions`, `setCurrentSession`, `addSession`, `removeSession`
- [x] 메시지: `messages`, `setMessages`, `addMessage`, `updateMessage`
- [x] 스트리밍: `streamingContent`, `isStreaming`, `appendStreamChunk`, `startStreaming`, `stopStreaming`
- [x] 모드: `mode`, `setMode`
- [x] 설정 모달: `showSettings`, `setShowSettings`

> **상태: 완료**

---

## Phase 11 — React UI 컴포넌트

### 레이아웃
- [x] `App.tsx` — Sidebar + ChatArea + SettingsModal
- [x] `Sidebar.tsx` — 세션 목록, 새 대화, 설정 버튼, hover 삭제
- [x] `ChatArea.tsx` — HwpStatusBar + MessageList + InputArea

### 상태 표시
- [x] `HwpStatusBar.tsx` — 연결 상태 (녹/회/주황 원), 문서명, 페이지, 모드 토글

### 메시지
- [x] `MessageList.tsx` — 메시지 목록, 자동 스크롤, 스트리밍 표시
- [x] `UserMessage.tsx` — 우측 정렬 버블, 타임스탬프
- [x] `AssistantMessage.tsx` — 좌측 정렬, react-markdown 렌더링, DiffViewer 연동

### Diff 뷰어
- [x] `DiffViewer.tsx` — diffWords 기반, 추가(초록)/삭제(빨강+취소선)
- [x] 개별 수락/거절 버튼
- [x] 전체 수락/거절 버튼
- [x] 액션 뱃지 (삽입/교체/삭제)

### 입력
- [x] `InputArea.tsx` — 자동 높이 textarea, Enter/Shift+Enter, 전송/중단 버튼
- [x] 파일 드래그&드롭 영역
- [x] 첨부 파일 표시 + 제거 버튼

### 설정
- [x] `SettingsModal.tsx` — API 키 입력, 키 검증, 모델 선택, 창 배치 비율, 저장/닫기

> **상태: 완료**

---

## Phase 12 — 커스텀 훅

- [x] `useHwpStatus.ts` — 초기 상태 조회 + onStatusChanged 구독 + 클린업
- [x] `useStreaming.ts` — onStreamChunk + onChatComplete 구독 + 클린업
- [x] `useSession.ts` — 세션 목록 로드, loadSession, createSession, deleteSession

> **상태: 완료**

---

## Phase 13 — 스타일 & 테마

- [x] `globals.css` — Tailwind 지시어, 커스텀 스크롤바, 기본 타이포그래피
- [x] `tailwind.config.js` — 커스텀 색상 (surface, sidebar, primary)
- [x] 라이트 테마 기본 적용
- [ ] 다크 테마 CSS 변수 정의 (P2)
- [ ] 테마 전환 로직 연결 (P2)

> **상태: 다크 테마 제외 완료**

---

## Phase 14 — 테스트

### Unit 테스트
- [ ] `edit-parser.test.ts` — parseEditCommands 6개 케이스
- [ ] `diff.test.ts` — computeDiff 5개 케이스

### Integration 테스트
- [ ] `session-service.test.ts` — DB CRUD 6개 케이스
- [ ] `ai-service.test.ts` — 스트리밍/파싱/취소 (SDK 모킹)

### E2E 테스트
- [ ] Playwright + Electron 환경 설정
- [ ] 채팅 → Diff → 수락 시나리오
- [ ] 세션 전환 → 이력 복원 시나리오

> **상태: 미착수**

---

## Phase 15 — 빌드 & 배포

### 패키징
- [x] `electron-vite build` 성공 (main + preload + renderer)
- [ ] `electron-builder.yml` 설정
- [ ] NSIS 인스톨러 생성 테스트
- [ ] Native Addon 프리빌트 바이너리 포함

### 에러 처리 & 복구
- [ ] HWP 프로세스 종료 → 자동 재연결 (3회)
- [ ] AI API 429/500 → 지수 백오프 재시도
- [ ] API 키 만료 → 설정 모달 자동 유도
- [ ] SQLite 손상 → 백업 복구

### 로깅
- [ ] electron-log 설정 (레벨, 파일, 로테이션)
- [ ] COM 실패 / AI 에러 / IPC 타임아웃 error 레벨 기록

### 보안
- [x] `contextIsolation: true`, `nodeIntegration: false`
- [ ] API 키 `safeStorage` 암호화 저장
- [ ] CSP 헤더 `script-src 'self'`
- [ ] 문서 전송 동의 UI (첫 실행)

> **상태: 빌드 성공, 배포 설정 미착수**

---

## MVP 완료 기준

> HWP에서 문서를 열고, "3번 문단을 경어체로 바꿔줘" 입력 →
> AI가 Diff 생성 → "수락" → HWP 문서에 반영

- [ ] Phase 0: COM PoC 통과 (Windows 환경 필요)
- [x] Phase 1: `npm run dev` → Electron 앱 실행
- [x] Phase 1: HWP 감지/상태 표시 (Mock 동작)
- [x] Phase 2: 10페이지 문단 텍스트 배열 획득 (Mock)
- [x] Phase 3: AI 스트리밍 채팅 구현
- [x] Phase 3: 편집 명령 파서 구현
- [x] Phase 3: 세션 관리 구현
- [x] Phase 4: Diff 미리보기 UI 구현
- [x] Phase 4: 전체 수락/거절 + 개별 수락/거절
- [x] Phase 4: 편집 적용 로직 (뒤→앞 순서)
- [ ] Phase 4: 실제 HWP 문서 반영 (Windows + COM 필요)

---

## 요약 통계

| 구분 | 완료 | 미완료 | 완료율 |
|---|---|---|---|
| 공유 타입 & 상수 | 14/14 | 0 | 100% |
| 데이터베이스 | 21/23 | 2 | 91% |
| HWP 서비스 | 22/25 | 3 | 88% |
| AI 서비스 | 13/14 | 1 | 93% |
| 파일 파서 | 7/8 | 1 | 88% |
| IPC 핸들러 | 17/17 | 0 | 100% |
| Preload | 8/8 | 0 | 100% |
| 메인 진입점 | 9/12 | 3 | 75% |
| Zustand 스토어 | 6/6 | 0 | 100% |
| React UI | 16/16 | 0 | 100% |
| 커스텀 훅 | 3/3 | 0 | 100% |
| 스타일 | 3/5 | 2 | 60% |
| 테스트 | 0/9 | 9 | 0% |
| 빌드 & 배포 | 2/12 | 10 | 17% |
| **전체** | **141/172** | **31** | **82%** |

### 남은 핵심 작업 (우선순위순)
1. **Phase 0 COM PoC** — Windows에서 검증 (프로젝트 성패 좌우)
2. **Win32HwpAdapter 실제 구현** — COM 바인딩 C++ 애드온
3. **테스트 작성** — unit + integration
4. **보안 강화** — API 키 암호화, CSP, 동의 UI
5. **빌드 & 배포** — electron-builder, NSIS, 로깅
6. **다크 테마** — P2
