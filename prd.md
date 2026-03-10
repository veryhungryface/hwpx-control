# HWP AI Assistant — Product Requirements Document

> Electron 기반 inline AI 클론. 한글 프로그램(HWP)을 COM/Win32 API로 제어하며, AI 채팅을 통해 문서를 읽고/쓰고/편집하는 데스크탑 비서.

---

## 목차

1. [프로젝트 개요](#1-프로젝트-개요)
2. [아키텍처 설계](#2-아키텍처-설계)
3. [기술 스택 상세](#3-기술-스택-상세)
4. [기능 요구사항](#4-기능-요구사항)
5. [데이터 모델](#5-데이터-모델)
6. [IPC 프로토콜](#6-ipc-프로토콜)
7. [AI 연동 설계](#7-ai-연동-설계)
8. [Phase별 상세 구현 가이드](#8-phase별-상세-구현-가이드)
9. [UI/UX 설계](#9-uiux-설계)
10. [보안 설계](#10-보안-설계)
11. [비기능 요구사항](#11-비기능-요구사항)
12. [테스트 전략](#12-테스트-전략)
13. [리스크 & 대응 전략](#13-리스크--대응-전략)
14. [MVP 정의](#14-mvp-정의)
15. [일정 & 마일스톤](#15-일정--마일스톤)

---

## 1. 프로젝트 개요

**프로젝트명:** HWP AI Assistant (가칭)

**목표:** Electron 앱으로 한글 프로그램(HWP)을 Win32 API/COM으로 제어하며, AI 채팅을 통해 문서를 읽고/쓰고/편집하는 데스크탑 비서를 구현한다. inline AI의 핵심 워크플로우를 재현하되, 오픈소스 기반으로 확장 가능한 구조를 갖춘다.

**타깃 사용자:**
- 한글 프로그램으로 문서를 작성하는 사무직/공무원/학생
- AI 보조 편집을 통해 문서 품질을 높이고 작업 시간을 줄이고자 하는 사용자

**핵심 가치:**
- HWP 문서를 AI가 직접 읽고 편집할 수 있는 **양방향 연동**
- 편집 전 Diff 미리보기로 **사용자가 최종 결정권**을 가짐
- 로컬 실행으로 **문서 데이터가 외부 저장소에 남지 않음** (AI API 호출 제외)

**지원 환경:**
- OS: Windows 10 21H2 이상, Windows 11
- HWP: 한컴오피스 한/글 2020, 2022, 2024, NEX
- 런타임: Electron 33+ (Chromium 130+, Node.js 20+)

---

## 2. 아키텍처 설계

### 2.1 시스템 구성도

```
┌────────────────────────────────────────────────────────────┐
│                      Electron App                          │
│                                                            │
│  ┌──────────────────┐        ┌──────────────────────────┐  │
│  │   Renderer        │  IPC   │   Main Process           │  │
│  │   (React + TS)    │◄──────►│   (TypeScript)           │  │
│  │                   │        │                          │  │
│  │ - 채팅 UI          │        │ - HwpService             │  │
│  │ - Diff 뷰어        │        │ - AiService              │  │
│  │ - 세션 사이드바     │        │ - SessionService         │  │
│  │ - 설정 패널        │        │ - FileParserService      │  │
│  │ - 파일 드롭존       │        │ - WindowManagerService   │  │
│  └──────────────────┘        └────────────┬─────────────┘  │
│           │                               │                │
│  ┌────────▼─────────┐        ┌────────────▼─────────────┐  │
│  │  Preload Script   │        │  C++ Native Addon        │  │
│  │  (contextBridge)  │        │  (N-API / cmake-js)      │  │
│  │                   │        │                          │  │
│  │ - IPC 브릿지 노출   │        │ - COM: HWPFrame.HwpObject│  │
│  │ - 타입 안전 API     │        │ - Win32: FindWindow      │  │
│  └──────────────────┘        │ - Win32: SetWindowPos    │  │
│                              │ - Win32: GetMonitorInfo   │  │
│                              │ - WinEvent Hook           │  │
│                              └────────────┬─────────────┘  │
└───────────────────────────────────────────┼────────────────┘
                    │                       │
                    ▼                       ▼
            ┌──────────────┐       ┌────────────────┐
            │  AI API       │       │  HWP.exe       │
            │  (Claude /    │       │  (한글 프로그램)  │
            │   OpenAI)     │       │                │
            └──────────────┘       └────────────────┘
```

### 2.2 프로세스 간 통신 흐름

```
사용자 입력 (Renderer)
    │
    ▼
contextBridge (Preload)
    │
    ▼ ipcRenderer.invoke / ipcRenderer.send
Main Process
    ├─→ AiService: Claude API 호출 (스트리밍)
    │       └─→ ipcMain → Renderer (청크 단위 전송)
    ├─→ HwpService: C++ Addon 호출
    │       └─→ COM/Win32 → HWP.exe
    └─→ SessionService: SQLite 읽기/쓰기
```

### 2.3 핵심 설계 원칙

| 원칙 | 설명 |
|---|---|
| **Context Isolation** | `contextIsolation: true`, `nodeIntegration: false`. Renderer는 Preload가 노출한 API만 사용 |
| **Native Addon은 Main에서만** | C++ Addon 호출은 반드시 Main Process에서. Renderer에서 직접 호출 금지 |
| **단방향 데이터 흐름** | Renderer → (IPC invoke) → Main → (IPC event) → Renderer |
| **편집 명령의 불변성** | AI가 반환한 편집 명령은 수정 없이 그대로 보관. 적용/취소 시 원본 참조 |
| **뒤에서 앞으로 편집** | 복수 편집 적용 시 문서 뒤쪽부터 앞쪽 순서로 적용 (오프셋 밀림 방지) |

---

## 3. 기술 스택 상세

### 3.1 핵심 의존성

| 영역 | 기술 | 버전 | 선택 이유 |
|---|---|---|---|
| 프레임워크 | Electron | 33+ | Chromium + Node.js 통합, 데스크탑 네이티브 접근 |
| 빌드 도구 | electron-vite | 2.x | Vite 기반 빠른 HMR, 메인/프리로드/렌더러 자동 분리 |
| 언어 | TypeScript | 5.x | 타입 안전성, 메인/렌더러 공유 타입 |
| UI | React | 18+ | 컴포넌트 기반, 풍부한 생태계 |
| 상태관리 | Zustand | 5.x | 가볍고 보일러플레이트 최소 |
| 스타일링 | Tailwind CSS | 4.x | 유틸리티 기반, 빠른 프로토타이핑 |
| DB | better-sqlite3 | 11+ | 동기 API, Electron과 호환 우수 |
| Diff | jsdiff | 7+ | 텍스트 Diff 계산 |
| 마크다운 | react-markdown | 9+ | AI 응답 렌더링 |
| Native Addon | cmake-js + N-API | - | node-gyp 대비 빌드 안정성, cmake 기반 크로스 컴파일 |
| AI SDK | @anthropic-ai/sdk | 최신 | Claude API 공식 SDK, 스트리밍 지원 |

### 3.2 C++ Native Addon 구조

```
native/
├── CMakeLists.txt
├── src/
│   ├── addon.cpp          # N-API 모듈 진입점, 함수 등록
│   ├── hwp_com.cpp        # COM 자동화 (HWPFrame.HwpObject)
│   ├── hwp_com.h
│   ├── window_manager.cpp # FindWindow, SetWindowPos, GetMonitorInfo
│   ├── window_manager.h
│   ├── event_hook.cpp     # SetWinEventHook 래퍼
│   └── event_hook.h
└── binding.gyp            # node-gyp 폴백용 (선택)
```

**빌드 요구사항:**
- Visual Studio 2022 Build Tools (v143 toolset)
- Windows SDK 10.0.22621.0+
- cmake-js가 `prebuild`로 프리빌트 바이너리 제공 → 엔드유저 빌드 불필요

### 3.3 검토했으나 채택하지 않은 대안

| 대안 | 검토 결과 | 미채택 이유 |
|---|---|---|
| Tauri (Rust) | 바이너리 크기/메모리 우수 | Rust에서 COM 자동화가 까다로움, 생태계 미성숙 |
| koffi (FFI) | 순수 JS에서 Win32 호출 가능 | 단순 Win32는 가능하나 COM IDispatch 호출이 복잡 |
| Python 백엔드 (win32com) | COM 자동화 가장 쉬움 | 별도 프로세스 필요, 패키징 복잡도 증가 |
| Accessibility API | 읽기는 가능 | 쓰기/편집 불가능 |

---

## 4. 기능 요구사항

### 4.1 HWP 연동 (FR-HWP)

| ID | 기능 | 설명 | 우선순위 |
|---|---|---|---|
| FR-HWP-01 | HWP 프로세스 감지 | HWP.exe 실행 여부를 2초 간격 폴링으로 감지. 복수 인스턴스 지원 | P0 |
| FR-HWP-02 | 창 2분할 배치 | HWP를 모니터 왼쪽 50%, Electron을 오른쪽 50%에 자동 배치. 다중 모니터 시 HWP가 위치한 모니터 기준 | P0 |
| FR-HWP-03 | 문서 텍스트 읽기 | 현재 커서 위치 기준 ±5페이지(총 10페이지) 텍스트를 문단 단위로 추출. 문단 번호 부여 | P0 |
| FR-HWP-04 | 텍스트 삽입 | 지정 위치(문단 뒤)에 새 텍스트 삽입 | P0 |
| FR-HWP-05 | 텍스트 교체 | 지정 문단의 특정 문자열을 새 문자열로 교체 | P0 |
| FR-HWP-06 | 텍스트 삭제 | 지정 문단 삭제 | P0 |
| FR-HWP-07 | 선택 텍스트 감지 | HWP에서 사용자가 드래그 선택한 텍스트를 500ms 폴링으로 감지 | P1 |
| FR-HWP-08 | 표 셀 편집 | 표 내부 특정 셀의 텍스트 읽기/쓰기 | P2 |
| FR-HWP-09 | 서식 정보 조회 | CharShape, ParaShape를 통한 글꼴/크기/줄간격 정보 수집 | P2 |
| FR-HWP-10 | 연결 상태 표시 | HWP 연동 상태를 실시간 UI 뱃지로 표시 (연결됨/끊김/재연결 중) | P0 |

### 4.2 AI 채팅 (FR-AI)

| ID | 기능 | 설명 | 우선순위 |
|---|---|---|---|
| FR-AI-01 | 편집 모드 채팅 | 문서 컨텍스트 포함, AI가 편집 명령을 JSON으로 반환 | P0 |
| FR-AI-02 | 대화 모드 채팅 | 문서 컨텍스트 포함, 편집 없이 질의응답만 | P1 |
| FR-AI-03 | 스트리밍 응답 | AI 응답을 청크 단위로 실시간 표시 | P0 |
| FR-AI-04 | 응답 중단 | 생성 중인 AI 응답을 즉시 중단 | P0 |
| FR-AI-05 | 모델 선택 | Claude Sonnet / Opus 등 모델 전환 | P1 |
| FR-AI-06 | 토큰 사용량 표시 | 요청/응답별 토큰 수와 예상 비용 표시 | P2 |
| FR-AI-07 | 대화 이어하기 | 세션 내 이전 대화 맥락을 유지하며 연속 대화 | P0 |

### 4.3 편집 & Diff (FR-EDIT)

| ID | 기능 | 설명 | 우선순위 |
|---|---|---|---|
| FR-EDIT-01 | Diff 미리보기 | AI 제안 편집의 추가(초록)/삭제(빨강+취소선) 시각화 | P0 |
| FR-EDIT-02 | 전체 수락 | 모든 편집 명령을 HWP에 일괄 적용 | P0 |
| FR-EDIT-03 | 전체 거절 | 모든 편집 명령을 폐기 | P0 |
| FR-EDIT-04 | 개별 수락/거절 | 편집 명령을 하나씩 선택적으로 수락/거절 | P1 |
| FR-EDIT-05 | 편집 되돌리기 | 적용된 편집을 원래 텍스트로 복원 (자체 Undo 스택) | P1 |
| FR-EDIT-06 | 편집 이력 조회 | 세션 내 수행된 모든 편집 이력과 상태 확인 | P2 |

### 4.4 세션 관리 (FR-SESSION)

| ID | 기능 | 설명 | 우선순위 |
|---|---|---|---|
| FR-SESSION-01 | 새 세션 생성 | 새 대화 세션 시작. 연결된 HWP 문서명 자동 기록 | P0 |
| FR-SESSION-02 | 세션 목록 | 사이드바에 세션 목록 표시 (최신순) | P0 |
| FR-SESSION-03 | 세션 전환 | 세션 간 전환 시 대화 이력 복원 | P0 |
| FR-SESSION-04 | 세션 삭제 | 세션과 관련 메시지/편집 이력 일괄 삭제 | P1 |
| FR-SESSION-05 | 세션 제목 편집 | 자동 생성된 제목을 사용자가 수정 | P1 |

### 4.5 파일 업로드 (FR-FILE)

| ID | 기능 | 설명 | 우선순위 |
|---|---|---|---|
| FR-FILE-01 | 파일 드래그&드롭 | 채팅 입력 영역에 파일을 드롭하여 업로드 | P1 |
| FR-FILE-02 | PDF 파싱 | PDF 텍스트 추출 후 AI 컨텍스트에 포함 | P1 |
| FR-FILE-03 | DOCX 파싱 | Word 문서 텍스트 추출 | P1 |
| FR-FILE-04 | HWPX 파싱 | OOXML 기반 hwpx 파일 텍스트 추출 | P1 |
| FR-FILE-05 | 이미지 첨부 | 이미지 파일을 Vision API로 전달 | P2 |
| FR-FILE-06 | 대용량 파일 청킹 | 토큰 한도 초과 시 앞부분 N자로 절단 + 경고 표시 | P1 |

### 4.6 설정 (FR-SETTINGS)

| ID | 기능 | 설명 | 우선순위 |
|---|---|---|---|
| FR-SETTINGS-01 | API 키 관리 | Claude/OpenAI API 키 입력, 검증, 암호화 저장 | P0 |
| FR-SETTINGS-02 | 모델 선택 | 기본 사용 모델 설정 | P1 |
| FR-SETTINGS-03 | 창 배치 설정 | 분할 비율 (50/50, 60/40, 70/30), 좌우 반전 | P1 |
| FR-SETTINGS-04 | 테마 | 라이트/다크 모드 전환 | P2 |

---

## 5. 데이터 모델

### 5.1 SQLite 스키마

```sql
-- 대화 세션
CREATE TABLE sessions (
  id          TEXT PRIMARY KEY,       -- nanoid
  title       TEXT NOT NULL,          -- 자동 생성 or 사용자 편집
  mode        TEXT NOT NULL DEFAULT 'edit',  -- 'edit' | 'chat'
  hwp_doc     TEXT,                   -- 연결된 HWP 문서 파일명
  created_at  TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

-- 메시지
CREATE TABLE messages (
  id          TEXT PRIMARY KEY,       -- nanoid
  session_id  TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  role        TEXT NOT NULL,          -- 'user' | 'assistant' | 'system'
  content     TEXT NOT NULL,          -- 메시지 본문 (마크다운)
  edits_json  TEXT,                   -- AI 편집 명령 JSON (assistant만)
  edit_status TEXT DEFAULT 'none',    -- 'none' | 'pending' | 'accepted' | 'rejected' | 'partial'
  token_input  INTEGER,              -- 입력 토큰 수
  token_output INTEGER,              -- 출력 토큰 수
  created_at  TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),

  -- 인덱스
  CONSTRAINT fk_session FOREIGN KEY (session_id) REFERENCES sessions(id)
);
CREATE INDEX idx_messages_session ON messages(session_id, created_at);

-- 편집 이력 (개별 편집 단위 추적)
CREATE TABLE edit_history (
  id            TEXT PRIMARY KEY,
  message_id    TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  seq           INTEGER NOT NULL,      -- 해당 메시지 내 편집 순서
  action        TEXT NOT NULL,          -- 'insert' | 'replace' | 'delete'
  paragraph     INTEGER,               -- 대상 문단 번호
  original_text TEXT,                   -- 적용 전 원본 (되돌리기용)
  new_text      TEXT,                   -- 적용 후 텍스트
  status        TEXT DEFAULT 'pending', -- 'pending' | 'applied' | 'reverted' | 'rejected'
  applied_at    TEXT
);
CREATE INDEX idx_edit_message ON edit_history(message_id, seq);

-- 설정 (key-value)
CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- 첨부 파일 메타데이터
CREATE TABLE attachments (
  id          TEXT PRIMARY KEY,
  message_id  TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  filename    TEXT NOT NULL,
  mime_type   TEXT NOT NULL,
  size_bytes  INTEGER NOT NULL,
  text_preview TEXT,                   -- 파싱된 텍스트 앞부분 (검색/표시용)
  created_at  TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);
```

### 5.2 TypeScript 공유 타입

```typescript
// shared/types.ts — 메인과 렌더러 모두에서 import

interface Session {
  id: string;
  title: string;
  mode: 'edit' | 'chat';
  hwpDoc: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Message {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  edits: EditCommand[] | null;
  editStatus: 'none' | 'pending' | 'accepted' | 'rejected' | 'partial';
  tokenInput: number | null;
  tokenOutput: number | null;
  createdAt: string;
}

interface EditCommand {
  action: 'insert' | 'replace' | 'delete';
  paragraph: number;                    // 대상 문단 번호
  search?: string;                      // replace 시: 문단 내 찾을 문자열
  text?: string;                        // insert/replace 시: 새 텍스트
}

interface HwpStatus {
  connected: boolean;
  hwpVersion: string | null;
  docName: string | null;
  cursorPage: number | null;
  totalPages: number | null;
}

interface DocumentContext {
  pageRange: [number, number];          // [시작 페이지, 끝 페이지]
  paragraphs: NumberedParagraph[];
  totalParagraphs: number;
}

interface NumberedParagraph {
  index: number;                        // 문단 번호 (1-based)
  text: string;                         // 문단 텍스트
  page: number;                         // 해당 문단이 속한 페이지
}

interface DiffResult {
  original: string;
  modified: string;
  hunks: DiffHunk[];
}

interface DiffHunk {
  type: 'add' | 'remove' | 'equal';
  value: string;
}
```

---

## 6. IPC 프로토콜

### 6.1 채널 정의

Electron IPC는 두 가지 패턴을 사용한다:
- **invoke/handle** (요청-응답): 결과를 기다리는 호출
- **send/on** (단방향 이벤트): 스트리밍, 상태 알림

```
=== HWP 관련 ===

hwp:get-status          [invoke]  () → HwpStatus
  HWP 연결 상태, 문서명, 커서 페이지 등 조회

hwp:detect              [invoke]  () → { found: boolean; pid: number | null }
  HWP 프로세스 탐색 및 COM 연결 시도

hwp:arrange-windows     [invoke]  (layout: { ratio: number; swap: boolean }) → void
  창 배치 실행. ratio=0.5이면 50/50, swap=true면 좌우 반전

hwp:read-document       [invoke]  (opts: { pageRange?: [number, number] }) → DocumentContext
  문서 텍스트 읽기. pageRange 미지정 시 커서 기준 ±5페이지

hwp:apply-edits         [invoke]  (edits: EditCommand[]) → { applied: number; failed: number; errors: string[] }
  편집 명령 배치 적용 (뒤→앞 순서 자동 정렬)

hwp:revert-edits        [invoke]  (editIds: string[]) → { reverted: number }
  적용된 편집 되돌리기

hwp:get-selection       [invoke]  () → { text: string } | null
  현재 드래그 선택된 텍스트 반환

hwp:status-changed      [event→renderer]  HwpStatus
  HWP 상태 변경 시 자동 전송 (연결/끊김/문서전환)


=== AI 관련 ===

ai:chat                 [invoke]  (req: { sessionId: string; userMessage: string; mode: 'edit' | 'chat' }) → void
  AI 대화 시작. 응답은 ai:stream-chunk 이벤트로 전달

ai:stream-chunk         [event→renderer]  { sessionId: string; chunk: string; done: boolean }
  스트리밍 청크. done=true일 때 완료

ai:chat-complete        [event→renderer]  { sessionId: string; message: Message }
  스트리밍 완료 후 최종 파싱된 메시지 (편집 명령 포함)

ai:cancel               [invoke]  (sessionId: string) → void
  진행 중인 AI 응답 중단


=== 세션 관련 ===

session:list            [invoke]  () → Session[]
session:create          [invoke]  (opts: { mode: 'edit' | 'chat' }) → Session
session:load            [invoke]  (id: string) → { session: Session; messages: Message[] }
session:delete          [invoke]  (id: string) → void
session:rename          [invoke]  (id: string, title: string) → void


=== 파일 관련 ===

file:parse              [invoke]  (filePath: string) → { text: string; truncated: boolean; originalLength: number }
  파일 파싱 후 텍스트 추출. 대용량 시 절단


=== 설정 관련 ===

settings:get            [invoke]  () → Record<string, string>
settings:set            [invoke]  (key: string, value: string) → void
settings:validate-key   [invoke]  (provider: string, key: string) → { valid: boolean; error?: string }
  API 키 유효성 검증 (실제 API 호출로 확인)
```

### 6.2 Preload API 표면

```typescript
// preload/index.ts — contextBridge.exposeInMainWorld('api', { ... })

interface ElectronAPI {
  // HWP
  hwp: {
    getStatus(): Promise<HwpStatus>;
    detect(): Promise<{ found: boolean; pid: number | null }>;
    arrangeWindows(layout: { ratio: number; swap: boolean }): Promise<void>;
    readDocument(opts?: { pageRange?: [number, number] }): Promise<DocumentContext>;
    applyEdits(edits: EditCommand[]): Promise<{ applied: number; failed: number; errors: string[] }>;
    revertEdits(editIds: string[]): Promise<{ reverted: number }>;
    getSelection(): Promise<{ text: string } | null>;
    onStatusChanged(callback: (status: HwpStatus) => void): () => void;  // unsubscribe 반환
  };

  // AI
  ai: {
    chat(req: { sessionId: string; userMessage: string; mode: 'edit' | 'chat' }): Promise<void>;
    cancel(sessionId: string): Promise<void>;
    onStreamChunk(callback: (data: { sessionId: string; chunk: string; done: boolean }) => void): () => void;
    onChatComplete(callback: (data: { sessionId: string; message: Message }) => void): () => void;
  };

  // Session
  session: {
    list(): Promise<Session[]>;
    create(opts: { mode: 'edit' | 'chat' }): Promise<Session>;
    load(id: string): Promise<{ session: Session; messages: Message[] }>;
    delete(id: string): Promise<void>;
    rename(id: string, title: string): Promise<void>;
  };

  // File
  file: {
    parse(filePath: string): Promise<{ text: string; truncated: boolean; originalLength: number }>;
  };

  // Settings
  settings: {
    get(): Promise<Record<string, string>>;
    set(key: string, value: string): Promise<void>;
    validateKey(provider: string, key: string): Promise<{ valid: boolean; error?: string }>;
  };
}
```

---

## 7. AI 연동 설계

### 7.1 모드별 시스템 프롬프트

#### 편집 모드 (Edit Mode)

```
당신은 HWP 문서 편집 AI 비서입니다.

## 역할
사용자가 제공하는 한글 문서 텍스트를 분석하고, 요청에 따라 정확한 편집 명령을 생성합니다.

## 문서 형식
- 문서 텍스트는 [P1], [P2], [P3]... 형태의 문단 번호가 붙어 있습니다.
- 각 번호는 해당 문단의 고유 식별자입니다.

## 응답 규칙
1. 먼저 자연어로 어떤 편집을 왜 하는지 간단히 설명합니다.
2. 편집이 필요하면 반드시 <edit> 태그 안에 JSON 배열로 명령을 작성합니다.
3. 편집이 불필요한 질문(예: "이 문단이 무슨 뜻이야?")에는 <edit> 태그 없이 답변만 합니다.
4. 하나의 응답에 여러 편집을 포함할 수 있습니다.

## 편집 명령 형식
<edit>
[
  {
    "action": "replace",
    "paragraph": 5,
    "search": "교체할 원본 텍스트 (문단 내 정확한 부분 문자열)",
    "text": "새로운 텍스트"
  },
  {
    "action": "insert",
    "paragraph": 10,
    "text": "이 문단 뒤에 삽입될 새 문단 텍스트"
  },
  {
    "action": "delete",
    "paragraph": 15
  }
]
</edit>

## 주의사항
- replace의 "search"는 해당 문단에서 **정확히 일치**하는 부분 문자열이어야 합니다.
- 문단 전체를 교체하려면 search에 문단 전체 텍스트를 넣으세요.
- 여러 곳을 동시에 편집할 때, 문단 번호가 큰 것부터 작은 것 순서로 나열하세요.
- 확실하지 않은 편집은 하지 마세요. 대신 사용자에게 확인을 요청하세요.

## 현재 문서 (페이지 {startPage}~{endPage}, 총 {totalPages}페이지)
{numberedParagraphs}
```

#### 대화 모드 (Chat Mode)

```
당신은 HWP 문서에 대해 대화하는 AI 비서입니다.

## 역할
사용자가 제공하는 한글 문서에 대해 질문에 답하고, 내용을 분석하고, 조언을 제공합니다.
문서를 직접 편집하지는 않습니다.

## 응답 규칙
- <edit> 태그를 사용하지 마세요. 편집 명령을 생성하지 마세요.
- 문서 내용에 기반한 정확한 답변을 제공하세요.
- 문서에 없는 내용은 추측하지 말고 모른다고 말하세요.
- 마크다운 형식으로 깔끔하게 답변하세요.

## 현재 문서 (페이지 {startPage}~{endPage}, 총 {totalPages}페이지)
{numberedParagraphs}
```

### 7.2 문서 컨텍스트 구성

```
문서 텍스트를 AI에게 전달할 때의 포맷:

[P1] 제1조(목적) 이 법은 개인정보의 처리 및 보호에 관한 사항을 정함으로써...
[P2] 개인의 자유와 권리를 보호하고, 나아가 개인의 존엄과 가치를 구현함을...
[P3]
[P4] 제2조(정의) 이 법에서 사용하는 용어의 뜻은 다음과 같다.
[P5] 1. "개인정보"란 살아 있는 개인에 관한 정보로서 다음 각 목의...
...
```

**컨텍스트 윈도우 전략:**
- 기본: 현재 커서 기준 ±5페이지 = 약 10페이지
- 한글 문서 1페이지 ≈ 500~800자 ≈ 200~400 토큰 (한국어)
- 10페이지 ≈ 2,000~4,000 토큰 → Claude 컨텍스트의 2% 미만
- 대화 이력 + 시스템 프롬프트 + 문서 컨텍스트 + 첨부 파일 합산 관리 필요
- **토큰 버짓**: 입력 50,000 토큰 이하 유지 목표 (비용 관리)

### 7.3 편집 명령 파싱

```typescript
// AI 응답에서 편집 명령 추출
function parseEditCommands(response: string): { text: string; edits: EditCommand[] | null } {
  const editRegex = /<edit>([\s\S]*?)<\/edit>/;
  const match = response.match(editRegex);

  if (!match) {
    return { text: response.trim(), edits: null };
  }

  // <edit> 태그 제거한 순수 텍스트
  const text = response.replace(editRegex, '').trim();

  try {
    const edits: EditCommand[] = JSON.parse(match[1]);
    // 유효성 검증
    for (const edit of edits) {
      if (!['insert', 'replace', 'delete'].includes(edit.action)) {
        throw new Error(`Unknown action: ${edit.action}`);
      }
      if (typeof edit.paragraph !== 'number' || edit.paragraph < 1) {
        throw new Error(`Invalid paragraph: ${edit.paragraph}`);
      }
    }
    return { text, edits };
  } catch (e) {
    // JSON 파싱 실패 → 편집 명령 없이 전체를 텍스트로 반환
    console.error('Edit command parse failed:', e);
    return { text: response.trim(), edits: null };
  }
}
```

### 7.4 편집 충돌 감지

AI가 편집 명령을 생성한 시점과 사용자가 "수락"을 누른 시점 사이에 문서가 변경되었을 수 있다.

**충돌 감지 프로세스:**
1. 편집 명령 생성 시: 대상 문단의 텍스트를 스냅샷으로 저장
2. "수락" 시: 해당 문단을 다시 읽어 스냅샷과 비교
3. 불일치 시: "문서가 변경되었습니다. 편집을 다시 생성하시겠습니까?" 경고
4. 일치 시: 편집 적용 진행

---

## 8. Phase별 상세 구현 가이드

### Phase 0 — COM PoC 검증 (착수 전 필수, 2~3일)

> **이 단계를 통과하지 못하면 프로젝트 전체 접근법을 재검토해야 한다.**

**목표:** 순수 C++ 또는 Python으로 HWP COM 자동화가 동작하는지 확인한다.

**검증 항목:**
1. `CoCreateInstance("HWPFrame.HwpObject")`로 HWP COM 객체 생성
2. `Open`으로 HWP 파일 열기
3. `GetTextFile`로 문서 전체 텍스트 읽기
4. `MovePos`, `GetPos`로 커서 이동 및 위치 조회
5. `InsertText`로 텍스트 삽입 후 실제 문서에 반영 확인

**검증 방법 (Python으로 빠르게):**
```python
import win32com.client

hwp = win32com.client.gencache.EnsureDispatch("HWPFrame.HwpObject")
hwp.XHwpWindows.Item(0).Visible = True
hwp.Open("C:\\test.hwp")

# 텍스트 읽기
text = hwp.GetTextFile("TEXT", "")
print(text[:500])

# 커서 위치
list_id, para_id, char_id = hwp.GetPos()
print(f"ListID={list_id}, Para={para_id}, Char={char_id}")

# 텍스트 삽입
hwp.HAction.GetDefault("InsertText", hwp.HParameterSet.HInsertText.HSet)
hwp.HParameterSet.HInsertText.Text = "AI가 삽입한 텍스트"
hwp.HAction.Execute("InsertText", hwp.HParameterSet.HInsertText.HSet)
```

**합격 기준:** 위 5개 항목 모두 성공 → Phase 1 진행
**불합격 시 대안:**
- 클립보드 방식 (SendMessage로 Ctrl+A, Ctrl+C) → UX 열악하지만 동작은 함
- HWP 대신 hwpx 파일을 직접 XML 파싱하여 편집 → HWP 프로그램 불필요
- 프로젝트 범위를 "HWP 뷰어 + AI 조언"으로 축소 (편집 기능 제거)

---

### Phase 1 — 프로젝트 세팅 & HWP 감지 (1~2주)

**목표:** Electron 앱이 실행되고, HWP 프로세스를 감지하며, 기본 창 관리가 동작한다.

**1-1. Electron 프로젝트 초기화**

```bash
npm create electron-vite@latest hwp-ai-assistant -- --template react-ts
cd hwp-ai-assistant
npm install
```

생성되는 디렉토리 구조:
```
src/
├── main/           # Main Process
│   └── index.ts
├── preload/        # Preload Script
│   └── index.ts
├── renderer/       # React App
│   ├── src/
│   │   ├── App.tsx
│   │   └── main.tsx
│   └── index.html
└── shared/         # 공유 타입 (직접 생성)
    └── types.ts
```

`tsconfig`는 electron-vite가 메인/렌더러용을 자동 분리. `shared/` 디렉토리를 양쪽 tsconfig의 `paths`에 추가.

**1-2. C++ Native Addon 세팅**

```bash
npm install cmake-js node-addon-api --save-dev
```

`native/CMakeLists.txt`:
```cmake
cmake_minimum_required(VERSION 3.15)
project(hwp_native)

# N-API 헤더
include_directories(${CMAKE_JS_INC})
file(GLOB SOURCE_FILES "src/*.cpp")
add_library(${PROJECT_NAME} SHARED ${SOURCE_FILES} ${CMAKE_JS_SRC})
set_target_properties(${PROJECT_NAME} PROPERTIES PREFIX "" SUFFIX ".node")
target_link_libraries(${PROJECT_NAME} ${CMAKE_JS_LIB} ole32 oleaut32)

# node-addon-api
execute_process(COMMAND node -p "require('node-addon-api').include"
  WORKING_DIRECTORY ${CMAKE_SOURCE_DIR} OUTPUT_VARIABLE NODE_ADDON_API_DIR)
string(REPLACE "\n" "" NODE_ADDON_API_DIR ${NODE_ADDON_API_DIR})
target_include_directories(${PROJECT_NAME} PRIVATE ${NODE_ADDON_API_DIR})
target_compile_definitions(${PROJECT_NAME} PRIVATE NAPI_VERSION=8)
```

**1-3. HWP 프로세스 감지**

C++ Addon에서 `FindWindowW(L"HWP", NULL)` 또는 `EnumWindows`로 HWP 윈도우 탐색.
Main Process에서 2초 간격 타이머로 폴링.

```cpp
// native/src/window_manager.cpp
#include <napi.h>
#include <windows.h>

Napi::Value FindHwpWindow(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  HWND hwnd = FindWindowW(L"HWP", NULL);
  if (hwnd) {
    Napi::Object result = Napi::Object::New(env);
    result.Set("hwnd", (int64_t)hwnd);

    DWORD pid;
    GetWindowThreadProcessId(hwnd, &pid);
    result.Set("pid", (int32_t)pid);

    wchar_t title[256];
    GetWindowTextW(hwnd, title, 256);
    // title을 UTF-8로 변환하여 반환
    // ...
    return result;
  }
  return env.Null();
}
```

**1-4. 완료 기준 (Definition of Done)**
- [ ] `npm run dev`로 Electron 앱 실행 → React 화면 표시
- [ ] C++ Addon 빌드 성공 → Main Process에서 import 가능
- [ ] HWP 실행 시 "연결됨" 표시, 미실행 시 "HWP를 실행해주세요" 표시
- [ ] HWP를 켜고 끌 때 상태가 2초 이내에 반영

---

### Phase 2 — HWP 창 제어 & 텍스트 읽기 (2~3주)

**목표:** 창 분할 배치, COM을 통한 문서 텍스트 읽기/문단 파싱이 동작한다.

**2-1. 창 분할 배치**

```cpp
// 핵심: HWP 창이 위치한 모니터 기준으로 계산
void ArrangeWindows(HWND hwpHwnd, HWND electronHwnd, double ratio) {
  // 1. HWP가 있는 모니터 확인
  HMONITOR monitor = MonitorFromWindow(hwpHwnd, MONITOR_DEFAULTTONEAREST);
  MONITORINFO mi = { sizeof(mi) };
  GetMonitorInfo(monitor, &mi);

  RECT work = mi.rcWork;  // 태스크바 제외 작업 영역
  int totalWidth = work.right - work.left;
  int hwpWidth = (int)(totalWidth * ratio);
  int electronWidth = totalWidth - hwpWidth;

  // 2. HWP → 왼쪽, Electron → 오른쪽
  SetWindowPos(hwpHwnd, NULL,
    work.left, work.top, hwpWidth, work.bottom - work.top,
    SWP_NOZORDER);
  SetWindowPos(electronHwnd, NULL,
    work.left + hwpWidth, work.top, electronWidth, work.bottom - work.top,
    SWP_NOZORDER);
}
```

**2-2. COM 초기화 & 텍스트 읽기**

```cpp
// native/src/hwp_com.cpp
#include <napi.h>
#include <windows.h>
#include <comdef.h>

class HwpCom {
  IDispatch* pHwp = nullptr;

public:
  bool Initialize() {
    CoInitializeEx(NULL, COINIT_APARTMENTTHREADED);  // STA 필수
    CLSID clsid;
    CLSIDFromProgID(L"HWPFrame.HwpObject", &clsid);
    HRESULT hr = CoCreateInstance(clsid, NULL, CLSCTX_LOCAL_SERVER,
                                   IID_IDispatch, (void**)&pHwp);
    return SUCCEEDED(hr);
  }

  // GetTextFile("TEXT", "") → 문서 전체 텍스트
  std::wstring GetFullText() { /* IDispatch::Invoke 호출 */ }

  // GetPos() → (listId, paraId, charId)
  CursorPos GetCursorPos() { /* ... */ }

  // MovePos(moveType, ...) → 커서 이동
  void MoveCursor(int moveType) { /* ... */ }
};
```

**2-3. 문단 파싱 & 번호 부여**

COM의 `GetTextFile`이 반환하는 텍스트를 `\r\n` 기준으로 분리하여 문단 배열 생성.
빈 문단(빈 줄)도 번호를 부여하되, AI 전달 시 `[P3] (빈 줄)` 등으로 표시.

**2-4. 10페이지 윈도우 구현**

```typescript
// main/services/hwp-service.ts
async readDocumentContext(): Promise<DocumentContext> {
  const pos = await this.addon.getCursorPos();
  const currentPage = pos.page;
  const startPage = Math.max(1, currentPage - 5);
  const endPage = Math.min(this.totalPages, currentPage + 5);

  // MovePos로 startPage 첫 문단으로 이동 → endPage 마지막 문단까지 텍스트 추출
  const rawText = await this.addon.getTextRange(startPage, endPage);
  const paragraphs = this.parseParagraphs(rawText, startPage);

  return { pageRange: [startPage, endPage], paragraphs, totalParagraphs: paragraphs.length };
}
```

**2-5. 완료 기준**
- [ ] 앱 시작 시 HWP 왼쪽 / Electron 오른쪽 자동 배치
- [ ] 다중 모니터에서 HWP가 있는 모니터 기준으로 동작
- [ ] 문서 텍스트 10페이지 읽기 → 문단 번호 배열로 반환
- [ ] 빈 문서에서 에러 없이 빈 배열 반환
- [ ] COM 연결 실패 시 에러 메시지 표시 및 재시도 가능

---

### Phase 3 — 채팅 UI & AI 연동 (2~3주)

**목표:** 편집 모드 채팅이 동작하고, AI 응답이 스트리밍되며, 편집 명령이 파싱된다.

**3-1. UI 컴포넌트 구조**

```
App
├── Sidebar                    # 좌측 200px
│   ├── SessionList            # 세션 목록
│   ├── NewSessionButton       # 새 대화
│   └── SettingsButton         # 설정
├── ChatArea                   # 우측 나머지
│   ├── HwpStatusBar           # 상단: HWP 연결 상태 + 페이지 정보
│   ├── MessageList            # 메시지 목록 (스크롤)
│   │   ├── UserMessage        # 사용자 메시지 버블
│   │   ├── AssistantMessage   # AI 메시지 버블
│   │   │   └── DiffViewer     # 편집 명령이 있을 때 Diff 표시
│   │   └── SystemMessage      # 시스템 알림
│   └── InputArea              # 하단: 입력창 + 전송 버튼
│       ├── FileDropZone       # 파일 드래그 영역
│       ├── TextInput          # 텍스트 입력 (textarea, 자동 높이)
│       └── SendButton         # 전송 (Enter / Ctrl+Enter)
└── SettingsModal              # 설정 모달
```

**3-2. Zustand 스토어 설계**

```typescript
interface AppStore {
  // HWP 상태
  hwpStatus: HwpStatus;
  setHwpStatus: (status: HwpStatus) => void;

  // 세션
  sessions: Session[];
  currentSessionId: string | null;
  setSessions: (sessions: Session[]) => void;
  setCurrentSession: (id: string) => void;

  // 메시지
  messages: Message[];
  streamingContent: string;  // 스트리밍 중인 AI 응답 텍스트
  isStreaming: boolean;
  setMessages: (messages: Message[]) => void;
  appendStreamChunk: (chunk: string) => void;
  finalizeStream: (message: Message) => void;

  // 모드
  mode: 'edit' | 'chat';
  setMode: (mode: 'edit' | 'chat') => void;
}
```

**3-3. AI 스트리밍 처리 흐름**

```
사용자가 메시지 전송
    │
    ▼
Renderer: api.ai.chat({ sessionId, userMessage, mode })
    │
    ▼
Main Process:
  1. hwpService.readDocumentContext() → 문서 텍스트 획득
  2. 시스템 프롬프트 조립 (모드에 따라 편집/대화)
  3. 대화 이력 + 현재 메시지 조합
  4. Claude API 스트리밍 호출 시작
  5. 청크마다 → webContents.send('ai:stream-chunk', { chunk, done: false })
  6. 완료 시 → parseEditCommands(fullResponse)
  7. DB에 메시지 저장
  8. webContents.send('ai:chat-complete', { message })
    │
    ▼
Renderer:
  - stream-chunk 수신 → streamingContent 업데이트 → 메시지 버블 실시간 갱신
  - chat-complete 수신 → 최종 메시지로 교체, 편집 명령 있으면 DiffViewer 표시
```

**3-4. 완료 기준**
- [ ] 세션 생성/전환/삭제 동작
- [ ] 메시지 전송 → AI 스트리밍 응답 실시간 표시
- [ ] AI 응답에 `<edit>` 태그 포함 시 편집 명령 파싱 성공
- [ ] 응답 중단(Cancel) 동작
- [ ] 앱 재시작 시 대화 이력 보존

---

### Phase 4 — HWP 문서 편집 & Diff (3~4주)

> **이 Phase가 프로젝트에서 가장 어렵고 가장 중요하다.**

**목표:** AI 편집 명령을 Diff로 미리보고, 수락/거절하면 HWP에 실제 반영된다.

**4-1. Diff 뷰어 구현**

```typescript
// jsdiff로 문단 단위 diff 계산
import { diffWords } from 'diff';

function computeDiff(original: string, modified: string): DiffHunk[] {
  return diffWords(original, modified).map(part => ({
    type: part.added ? 'add' : part.removed ? 'remove' : 'equal',
    value: part.value,
  }));
}
```

DiffViewer 컴포넌트에서:
- `add` → `bg-green-100 text-green-800`
- `remove` → `bg-red-100 text-red-800 line-through`
- `equal` → 기본 스타일

각 편집 명령마다 개별 "수락"/"거절" 버튼 + 상단에 "전체 수락"/"전체 거절".

**4-2. 편집 명령 적용 전략**

```typescript
async function applyEdits(edits: EditCommand[]): Promise<ApplyResult> {
  // 핵심: 뒤쪽 문단부터 적용 (오프셋 밀림 방지)
  const sorted = [...edits].sort((a, b) => b.paragraph - a.paragraph);

  const results: Array<{ edit: EditCommand; success: boolean; error?: string }> = [];

  for (const edit of sorted) {
    try {
      // 1. 충돌 감지: 현재 문단 텍스트를 다시 읽어 스냅샷과 비교
      const currentText = await hwpAddon.getParagraphText(edit.paragraph);
      if (edit.action === 'replace' && !currentText.includes(edit.search!)) {
        throw new Error('문단 내용이 변경되어 편집을 적용할 수 없습니다');
      }

      // 2. 편집 전 원본 저장 (되돌리기용)
      await saveSnapshot(edit, currentText);

      // 3. COM 명령 실행
      switch (edit.action) {
        case 'replace':
          await hwpAddon.findAndReplace(edit.paragraph, edit.search!, edit.text!);
          break;
        case 'insert':
          await hwpAddon.insertAfterParagraph(edit.paragraph, edit.text!);
          break;
        case 'delete':
          await hwpAddon.deleteParagraph(edit.paragraph);
          break;
      }

      results.push({ edit, success: true });
    } catch (e) {
      results.push({ edit, success: false, error: e.message });
    }
  }

  return results;
}
```

**4-3. COM을 통한 편집 실행 상세**

| 작업 | COM 호출 순서 | 난이도 |
|---|---|---|
| 문서 끝에 삽입 | `MovePos(3)` → `InsertText` | 낮음 |
| 특정 문단 뒤 삽입 | `MovePos`로 해당 문단 끝 이동 → `InsertText("\r\n" + text)` | 중간 |
| 문단 내 부분 교체 | `FindText(search)` → 선택 → `InsertText(replacement)` | 중간 |
| 문단 전체 교체 | 문단 시작~끝 블록 선택 → `InsertText(replacement)` | 중간 |
| 문단 삭제 | 문단 시작~다음 문단 시작 블록 선택 → `Delete` | 중간 |
| 표 셀 편집 | `HAction.Run("TableCellBlock")` 등 조합 | 높음 (MVP 제외) |

**4-4. 되돌리기 (Undo) 구현**

HWP 자체 Undo 스택과 별개로 자체 되돌리기 관리:
- `edit_history` 테이블에 적용 전 `original_text` 저장
- "되돌리기" 시 `original_text`를 다시 HWP에 적용
- 되돌리기도 뒤→앞 순서로 실행

**4-5. 완료 기준**
- [ ] AI 편집 응답 → Diff 미리보기 정상 표시
- [ ] "전체 수락" → HWP 문서에 모든 편집 반영
- [ ] "전체 거절" → 편집 폐기, 문서 변경 없음
- [ ] 개별 수락/거절 동작
- [ ] 편집 되돌리기 동작
- [ ] 복수 편집(5개 이상) 동시 적용 시 오프셋 오류 없음
- [ ] 편집 중 문서 변경 시 충돌 경고 표시

---

### Phase 5 — 파일 업로드 & 고급 기능 (2~3주)

**목표:** 파일 첨부, 드래그 선택 감지, 대화 모드가 동작한다.

**5-1. 파일 파싱**

| 포맷 | 라이브러리 | 비고 |
|---|---|---|
| PDF | pdf-parse (pdfjs-dist) | 텍스트 레이어 추출 |
| DOCX | mammoth | HTML/텍스트 변환 |
| HWPX | 자체 구현 (JSZip + XML 파싱) | OOXML 기반, Contents/section*.xml 파싱 |
| HWP (구형) | COM으로 열어서 추출 또는 미지원 | OLE Compound Document, 난이도 높음 |
| TXT/CSV | 직접 읽기 | 인코딩 감지 (iconv-lite) |
| 이미지 | Vision API 전달 | Claude Vision |

**대용량 파일 처리:**
- 파싱 후 텍스트 길이 확인
- 50,000자 초과 시: 앞부분 50,000자로 절단 + "파일이 길어 앞부분만 포함합니다" 경고
- 향후: 임베딩 기반 RAG로 관련 청크만 선별 (Phase 5 이후)

**5-2. 드래그 선택 감지**

초기 구현 (폴링 방식):
```typescript
// main/services/hwp-service.ts
private selectionPoller: NodeJS.Timeout | null = null;

startSelectionPolling() {
  this.selectionPoller = setInterval(async () => {
    const selected = await this.addon.getSelectedText();
    if (selected && selected !== this.lastSelection) {
      this.lastSelection = selected;
      this.mainWindow.webContents.send('hwp:selection-changed', { text: selected });
    }
  }, 500);
}
```

향후 개선 (이벤트 방식):
```cpp
// native/src/event_hook.cpp
SetWinEventHook(
  EVENT_OBJECT_SELECTION, EVENT_OBJECT_SELECTION,
  NULL, WinEventCallback,
  hwpPid, 0,
  WINEVENT_OUTOFCONTEXT
);
```

**5-3. 완료 기준**
- [ ] PDF/DOCX/HWPX 파일 드래그&드롭 → 텍스트 추출 → AI 컨텍스트에 포함
- [ ] 대용량 파일 절단 + 경고 표시
- [ ] 대화 모드 전환 → 편집 명령 없이 대화만 진행
- [ ] HWP 드래그 선택 → "선택 영역 편집" 지원

---

### Phase 6 — 안정화 & 배포 (1~2주)

**목표:** 빌드 파이프라인 완성, 설치 프로그램 생성, 엣지 케이스 처리.

**6-1. 빌드 & 패키징**

```bash
# electron-vite + electron-builder
npm run build        # 메인/프리로드/렌더러 번들
npx electron-builder # NSIS 인스톨러 생성 (.exe)
```

`electron-builder` 설정:
- 타깃: NSIS (Windows 전용)
- Native Addon: `prebuild`로 프리빌트 바이너리 포함 → 엔드유저 빌드 도구 불필요
- Code signing: 자체 서명 또는 인증서 적용
- `requestedExecutionLevel: requireAdministrator` (Win32 API 접근 필요 시)

**6-2. 자동 업데이트 (MVP 이후)**

`electron-updater` + GitHub Releases:
- 앱 시작 시 최신 버전 확인
- 백그라운드 다운로드 → "업데이트 가능" 알림 → 사용자 확인 후 설치

**6-3. 에러 처리 & 복구**

| 상황 | 처리 |
|---|---|
| HWP 프로세스 종료 | 상태를 "끊김"으로 변경, 재시작 감지 시 자동 재연결 시도 |
| COM 연결 실패 | 3회 재시도 후 실패 → "HWP를 다시 시작해주세요" 안내 |
| AI API 오류 (429/500) | 지수 백오프 재시도 (최대 3회). 429: "잠시 후 다시 시도" 안내 |
| API 키 만료/무효 | 설정 패널로 유도하여 키 재입력 |
| 편집 적용 중 HWP 크래시 | 적용된 편집 이력 보존, "일부 편집만 적용됨" 경고 |
| SQLite 파일 손상 | 백업에서 복구 시도, 실패 시 빈 DB로 초기화 + 안내 |

**6-4. 로깅**

- `electron-log` 사용
- 레벨: error, warn, info, debug
- 파일 위치: `%APPDATA%/hwp-ai-assistant/logs/`
- 최대 5MB, 7일 로테이션
- COM 호출 실패, AI API 에러, IPC 타임아웃을 error로 기록

**6-5. 완료 기준**
- [ ] NSIS 인스톨러로 클린 Windows에 설치 → 정상 실행
- [ ] 관리자 권한 요청 → 허용 후 HWP 연동 정상
- [ ] HWP 2020/2022/2024 각각 테스트 통과
- [ ] 앱 크래시 없이 30분 이상 연속 사용 가능

---

## 9. UI/UX 설계

### 9.1 레이아웃

```
┌─────────────────────────────────────────────┐
│  HWP AI Assistant              [─] [□] [×]  │
├────────────┬────────────────────────────────┤
│            │  ● HWP 연결됨  |  3/15 페이지   │
│  세션 목록   ├────────────────────────────────┤
│            │                                │
│  ▸ 계약서   │  🧑 "3번 문단 존칭 표현으로    │
│    검토     │      바꿔주세요"                │
│            │                                │
│  ▸ 보고서   │  🤖 3번 문단의 "했다"를 "하였  │
│    초안     │    습니다"로 교체하겠습니다.     │
│            │                                │
│  ▸ 회의록   │  ┌──────────────────────────┐  │
│            │  │  -했다                     │  │
│            │  │  +하였습니다               │  │
│            │  │                           │  │
│            │  │   [수락]  [거절]           │  │
│            │  └──────────────────────────┘  │
│            │                                │
│            ├────────────────────────────────┤
│ [+ 새 대화] │  [📎] 메시지를 입력하세요... [➤]│
│ [⚙ 설정]   │                                │
├────────────┴────────────────────────────────┤
│  편집 모드 ● | 대화 모드 ○     토큰: 1,234   │
└─────────────────────────────────────────────┘
```

### 9.2 핵심 인터랙션

| 인터랙션 | 동작 |
|---|---|
| Enter | 메시지 전송 |
| Shift+Enter | 줄바꿈 |
| Ctrl+. | 응답 중단 |
| 파일 드래그&드롭 | 입력 영역에 파일 첨부 표시 |
| Diff "수락" 클릭 | 해당 편집 HWP에 적용, Diff 영역 사라짐 |
| Diff "거절" 클릭 | 해당 편집 폐기, Diff 영역 사라짐 |
| 사이드바 세션 클릭 | 해당 세션의 대화 이력 표시 |

### 9.3 상태 표시

| 상태 | UI 표현 |
|---|---|
| HWP 연결됨 | 녹색 원 + "HWP 연결됨" + 문서명 |
| HWP 미연결 | 회색 원 + "HWP를 실행해주세요" |
| HWP 재연결 중 | 주황 원 + 깜빡임 |
| AI 응답 중 | 입력 영역 비활성 + 타이핑 애니메이션 |
| 편집 적용 중 | 프로그레스 바 + "편집 적용 중..." |

---

## 10. 보안 설계

### 10.1 API 키 보관

- `electron-store`에 AES-256으로 암호화 저장
- 암호화 키: `safeStorage.encryptString` (OS 키체인 활용)
- Renderer에서 API 키 원문에 접근 불가 (Main에서만 복호화)

### 10.2 AI 응답 처리

- AI 응답의 `<edit>` 블록은 JSON 파싱만 수행. 코드 실행 없음
- 파싱된 EditCommand의 각 필드를 화이트리스트 검증:
  - `action`: `'insert' | 'replace' | 'delete'`만 허용
  - `paragraph`: 양의 정수만 허용
  - `search`, `text`: 문자열만 허용, 최대 길이 제한

### 10.3 Electron 보안

- `contextIsolation: true` (필수)
- `nodeIntegration: false` (필수)
- `webSecurity: true` (기본값 유지)
- CSP 헤더: `script-src 'self'`
- Preload에서 노출하는 API를 최소한으로 제한

### 10.4 네트워크

- AI API 호출만 외부 통신. 그 외 모든 데이터는 로컬
- API 호출은 HTTPS만 허용
- 문서 텍스트가 AI API로 전송되는 것에 대한 사용자 동의 UI 필요 (첫 사용 시)

---

## 11. 비기능 요구사항

### 11.1 성능

| 항목 | 목표 |
|---|---|
| 앱 시작 → 화면 표시 | 3초 이내 |
| HWP 감지 딜레이 | 2초 이내 |
| 10페이지 텍스트 읽기 | 1초 이내 |
| 편집 명령 1건 적용 | 500ms 이내 |
| 앱 메모리 사용량 (유휴) | 200MB 이하 |
| 앱 메모리 사용량 (활성) | 400MB 이하 |

### 11.2 호환성

| 항목 | 범위 |
|---|---|
| Windows | 10 21H2+, 11 |
| HWP | 한컴오피스 한/글 2020, 2022, 2024, NEX |
| 디스플레이 | 100%~200% DPI 스케일링 |
| 모니터 | 단일 ~ 3개 |

### 11.3 안정성

- 30분 이상 연속 사용 시 크래시 0건
- COM 연결 끊김 시 자동 재연결 (3회 재시도)
- 비정상 종료 시 채팅 이력 손실 없음 (SQLite WAL 모드)

---

## 12. 테스트 전략

### 12.1 테스트 레이어

| 레이어 | 대상 | 도구 | 범위 |
|---|---|---|---|
| Unit | 편집 명령 파서, Diff 계산, 문단 번호 파싱 | Vitest | 비즈니스 로직 전체 |
| Integration | IPC 통신, DB CRUD, AI 프롬프트 조립 | Vitest + better-sqlite3 | 서비스 레이어 |
| E2E | 전체 워크플로우 (채팅 → Diff → 수락) | Playwright (Electron) | 핵심 시나리오 |
| Manual | HWP COM 연동, 창 배치, 다중 모니터 | 수동 테스트 체크리스트 | HWP 버전별 |

### 12.2 핵심 테스트 시나리오

**편집 파서:**
- `<edit>` 태그 정상 파싱
- `<edit>` 태그 없는 응답 → edits: null
- 잘못된 JSON → 에러 없이 텍스트 응답으로 폴백
- action 필드 누락/잘못된 값 → 유효성 검증 실패

**편집 적용:**
- 단일 replace 적용 → HWP 문서에 반영
- 복수 편집 뒤→앞 순서 적용 → 오프셋 오류 없음
- 적용 후 되돌리기 → 원본 복원
- 문서 변경 후 적용 시도 → 충돌 경고

**스트리밍:**
- 정상 스트리밍 → 실시간 표시 + 완료 시 파싱
- 중단 → 수신된 만큼만 표시, 편집 명령 없음
- API 오류 → 에러 메시지 표시

---

## 13. 리스크 & 대응 전략

| # | 리스크 | 발생 확률 | 영향도 | 대응 |
|---|---|---|---|---|
| R1 | COM 바인딩이 특정 한글 버전에서 실패 | 높음 | 치명적 | **Phase 0에서 검증 필수.** 한글 2020/2022/2024 각각 테스트. 실패 시 클립보드 폴백 구현 |
| R2 | AI 편집 명령의 파싱 실패 / 잘못된 위치 지정 | 높음 | 높음 | JSON 파싱 실패 시 자연어 폴백. 프롬프트 반복 개선. 적용 전 충돌 감지로 잘못된 편집 차단 |
| R3 | 표 편집이 COM으로 안정적이지 않음 | 높음 | 중간 | MVP에서 표 편집 제외. 텍스트 편집만 먼저 완성 |
| R4 | 동시 편집 시 오프셋 밀림으로 문서 손상 | 중간 | 높음 | 뒤→앞 순서 적용 강제. 적용 전 스냅샷 비교. 되돌리기 기능 |
| R5 | Electron 앱 메모리 과다 사용 | 중간 | 중간 | V8 힙 제한 설정, 불필요한 패키지 제거, COM 객체 명시적 Release |
| R6 | 관리자 권한 없이 Win32 호출 차단 | 중간 | 중간 | manifest에 `requireAdministrator` 설정. 설치 안내에 명시 |
| R7 | Claude API 비용 초과 | 낮음 | 중간 | 토큰 사용량 실시간 표시. 일일/월간 한도 설정 기능 (P2) |
| R8 | HWP가 업데이트되며 COM 인터페이스 변경 | 낮음 | 높음 | COM 호출을 HwpCom 클래스로 추상화. 버전별 분기 가능한 구조 |

---

## 14. MVP 정의

### 14.1 MVP 범위 (Phase 1~4 핵심)

**포함:**
- HWP 프로세스 감지 + 2분할 창 배치
- COM으로 현재 커서 기준 10페이지 텍스트 읽기
- 편집 모드 AI 채팅 (스트리밍)
- 텍스트 삽입/교체/삭제 (문단 단위)
- Diff 미리보기 + 전체 수락/거절
- 세션 관리 (생성/전환/삭제)
- API 키 설정

**제외 (MVP 이후):**
- 대화 모드
- 파일 업로드
- 개별 수락/거절
- 편집 되돌리기
- 표 편집
- 서식 최적화 도구
- 드래그 선택 편집
- 테마 (다크 모드)
- 자동 업데이트
- 토큰 사용량/비용 표시

### 14.2 MVP 성공 기준

1. HWP에서 문서를 열고, 앱에서 "3번 문단을 경어체로 바꿔줘"라고 입력하면
2. AI가 Diff를 생성하고
3. "수락"을 누르면 HWP 문서에 실제로 반영된다

**이 한 줄의 시나리오가 동작하면 MVP 완성이다.**

---

## 15. 일정 & 마일스톤

| Phase | 내용 | 기간 | 난이도 | 마일스톤 |
|---|---|---|---|---|
| 0 | COM PoC 검증 | 2~3일 | ★★★ | HWP COM으로 텍스트 읽기/쓰기 성공 |
| 1 | 세팅 + HWP 감지 | 1~2주 | ★★☆ | Electron 앱 → HWP 감지 → 상태 표시 |
| 2 | 창 제어 + 텍스트 읽기 | 2~3주 | ★★★★★ | 10페이지 문단 텍스트 배열 획득 |
| 3 | 채팅 UI + AI 연동 | 2~3주 | ★★★☆ | AI 스트리밍 채팅 + 편집 명령 파싱 |
| 4 | HWP 편집 + Diff | 3~4주 | ★★★★★ | Diff 수락 → HWP 문서 반영 |
| 5 | 파일 업로드 + 고급 | 2~3주 | ★★★☆ | 파일 첨부, 대화 모드, 선택 감지 |
| 6 | 안정화 + 배포 | 1~2주 | ★★☆ | NSIS 인스톨러 배포 가능 |
| **총계** | | **11~18주** | | |

**크리티컬 패스:** Phase 0 → Phase 2 → Phase 4

Phase 0이 실패하면 프로젝트 전체 접근법을 재설계해야 한다.
Phase 2의 "10페이지 텍스트 읽기"와 Phase 4의 "편집 적용"이 기술적 핵심 난관이다.

---

## 부록 A. 디렉토리 구조 (최종)

```
hwp-ai-assistant/
├── package.json
├── electron-vite.config.ts
├── electron-builder.yml
├── native/                          # C++ Native Addon
│   ├── CMakeLists.txt
│   └── src/
│       ├── addon.cpp
│       ├── hwp_com.cpp / .h
│       ├── window_manager.cpp / .h
│       └── event_hook.cpp / .h
├── src/
│   ├── main/                        # Electron Main Process
│   │   ├── index.ts                 # 앱 진입점
│   │   ├── ipc-handlers.ts          # IPC 핸들러 등록
│   │   └── services/
│   │       ├── hwp-service.ts       # HWP 감지, 텍스트 읽기/쓰기
│   │       ├── ai-service.ts        # Claude API 호출, 스트리밍
│   │       ├── session-service.ts   # 세션/메시지 CRUD
│   │       ├── file-parser.ts       # 파일 파싱
│   │       ├── window-manager.ts    # 창 배치
│   │       └── db.ts                # SQLite 초기화, 마이그레이션
│   ├── preload/
│   │   └── index.ts                 # contextBridge API 노출
│   ├── renderer/
│   │   ├── index.html
│   │   └── src/
│   │       ├── main.tsx             # React 진입점
│   │       ├── App.tsx
│   │       ├── stores/
│   │       │   └── app-store.ts     # Zustand 스토어
│   │       ├── components/
│   │       │   ├── Sidebar.tsx
│   │       │   ├── ChatArea.tsx
│   │       │   ├── MessageList.tsx
│   │       │   ├── UserMessage.tsx
│   │       │   ├── AssistantMessage.tsx
│   │       │   ├── DiffViewer.tsx
│   │       │   ├── InputArea.tsx
│   │       │   ├── HwpStatusBar.tsx
│   │       │   └── SettingsModal.tsx
│   │       ├── hooks/
│   │       │   ├── useHwpStatus.ts
│   │       │   ├── useStreaming.ts
│   │       │   └── useSession.ts
│   │       └── styles/
│   │           └── globals.css      # Tailwind 설정
│   └── shared/
│       ├── types.ts                 # 공유 타입 정의
│       └── constants.ts             # 공유 상수
├── resources/                       # 앱 아이콘, 기타 리소스
└── tests/
    ├── unit/
    │   ├── edit-parser.test.ts
    │   └── diff.test.ts
    ├── integration/
    │   ├── session-service.test.ts
    │   └── ai-service.test.ts
    └── e2e/
        └── chat-flow.test.ts
```

## 부록 B. HWP COM 주요 메서드 레퍼런스

| 메서드 | 용도 | 파라미터 | 반환 |
|---|---|---|---|
| `GetTextFile(format, option)` | 문서 전체 텍스트 | `"TEXT"`, `""` | string |
| `GetPos()` | 현재 커서 위치 | - | (listId, paraId, charId) |
| `SetPos(listId, paraId, charId)` | 커서 이동 | 위치 좌표 | void |
| `MovePos(moveType)` | 커서 이동 (상대) | 0=앞, 1=뒤, 2=문단시작, 3=문서끝 등 | void |
| `FindText(text)` | 텍스트 검색+선택 | 검색 문자열 | boolean |
| `HAction.Run("InsertText")` | 텍스트 삽입 | HParameterSet 경유 | void |
| `HAction.Run("Delete")` | 선택 영역 삭제 | - | void |
| `CharShape` | 글자 서식 조회/변경 | - | object |
| `ParaShape` | 문단 서식 조회/변경 | - | object |
| `XHwpWindows.Item(0).Visible` | 창 표시/숨김 | boolean | void |
