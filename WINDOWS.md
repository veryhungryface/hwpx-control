# Windows 환경 작업 가이드

> macOS에서 개발된 코드를 Windows에서 클론하여 HWP 실제 연동까지 완성하는 절차.

---

## 1. 사전 준비

### 필수 소프트웨어

| 소프트웨어 | 용도 | 설치 |
|---|---|---|
| Node.js 20+ | 런타임 | https://nodejs.org (LTS) |
| Git | 소스 관리 | https://git-scm.com |
| Visual Studio 2022 Build Tools | C++ 네이티브 빌드 | 아래 참고 |
| 한컴오피스 한/글 2020/2022/2024 | HWP COM 자동화 대상 | 정품 설치 필요 |
| Python 3.10+ | Phase 0 COM PoC용 | https://python.org |

### Visual Studio Build Tools 설치

```powershell
# winget으로 설치 (또는 공식 사이트에서 다운로드)
winget install Microsoft.VisualStudio.2022.BuildTools

# 설치 시 "C++를 사용한 데스크톱 개발" 워크로드 선택
# 필요 구성요소:
#   - MSVC v143 빌드 도구
#   - Windows 10/11 SDK (10.0.22621.0+)
#   - CMake tools for Windows
```

---

## 2. 프로젝트 클론 & 설치

```powershell
git clone https://github.com/veryhungryface/hwpx-control.git
cd hwpx-control
npm install
```

### 빌드 확인

```powershell
# TypeScript 타입 체크
npx tsc --noEmit -p tsconfig.node.json
npx tsc --noEmit -p tsconfig.web.json

# electron-vite 빌드
npx electron-vite build

# 개발 모드 실행
npm run dev
```

앱이 실행되면 Mock 모드로 동작합니다. HWP 연결 상태가 Mock 데이터로 표시됩니다.

---

## 3. Phase 0 — COM PoC 검증 (가장 먼저!)

> **이 단계가 성공해야 프로젝트 전체가 가능합니다.**

### 3-1. Python 환경 준비

```powershell
pip install pywin32
```

### 3-2. HWP를 먼저 실행

한/글 프로그램을 열고, 아무 문서나 하나 열어둡니다.

### 3-3. PoC 스크립트 실행

프로젝트 루트에 `poc_com_test.py`를 생성:

```python
"""
HWP COM 자동화 PoC 검증 스크립트
5개 항목 모두 통과해야 프로젝트 진행 가능
"""
import win32com.client
import sys

def test():
    results = []

    # 1. COM 객체 생성
    try:
        hwp = win32com.client.gencache.EnsureDispatch("HWPFrame.HwpObject")
        hwp.XHwpWindows.Item(0).Visible = True
        results.append(("COM 객체 생성", True))
        print("✅ 1/5 COM 객체 생성 성공")
    except Exception as e:
        results.append(("COM 객체 생성", False))
        print(f"❌ 1/5 COM 객체 생성 실패: {e}")
        print("\n⚠️  COM 연결 실패. 한/글이 실행 중인지, 버전이 맞는지 확인하세요.")
        sys.exit(1)

    # 2. 텍스트 읽기
    try:
        text = hwp.GetTextFile("TEXT", "")
        assert len(text) > 0, "텍스트가 비어있음"
        results.append(("텍스트 읽기", True))
        print(f"✅ 2/5 텍스트 읽기 성공 (길이: {len(text)}자)")
        print(f"   처음 200자: {text[:200]}")
    except Exception as e:
        results.append(("텍스트 읽기", False))
        print(f"❌ 2/5 텍스트 읽기 실패: {e}")

    # 3. 커서 위치 조회
    try:
        pos = hwp.GetPos()
        results.append(("커서 위치 조회", True))
        print(f"✅ 3/5 커서 위치 조회 성공: List={pos[0]}, Para={pos[1]}, Char={pos[2]}")
    except Exception as e:
        results.append(("커서 위치 조회", False))
        print(f"❌ 3/5 커서 위치 조회 실패: {e}")

    # 4. 커서 이동 (문서 끝으로)
    try:
        hwp.MovePos(3)  # 3 = 문서 끝
        pos2 = hwp.GetPos()
        results.append(("커서 이동", True))
        print(f"✅ 4/5 커서 이동 성공: 문서 끝 위치 = List={pos2[0]}, Para={pos2[1]}")
    except Exception as e:
        results.append(("커서 이동", False))
        print(f"❌ 4/5 커서 이동 실패: {e}")

    # 5. 텍스트 삽입
    try:
        test_text = "\n[AI 테스트] COM 자동화 텍스트 삽입 성공!"
        act = hwp.CreateAction("InsertText")
        pset = act.CreateSet()
        pset.SetItem("Text", test_text)
        act.Execute(pset)
        results.append(("텍스트 삽입", True))
        print(f"✅ 5/5 텍스트 삽입 성공 — HWP 문서를 확인하세요!")
    except Exception as e:
        results.append(("텍스트 삽입", False))
        print(f"❌ 5/5 텍스트 삽입 실패: {e}")
        # 대안 방식 시도
        try:
            hwp.HAction.GetDefault("InsertText", hwp.HParameterSet.HInsertText.HSet)
            hwp.HParameterSet.HInsertText.Text = test_text
            hwp.HAction.Execute("InsertText", hwp.HParameterSet.HInsertText.HSet)
            results[-1] = ("텍스트 삽입 (대안)", True)
            print(f"✅ 5/5 텍스트 삽입 성공 (대안 방식) — HWP 문서를 확인하세요!")
        except Exception as e2:
            print(f"❌ 5/5 대안 방식도 실패: {e2}")

    # 결과 요약
    print("\n" + "="*50)
    passed = sum(1 for _, ok in results if ok)
    print(f"결과: {passed}/5 통과")
    if passed == 5:
        print("🎉 COM PoC 검증 완료! Phase 1으로 진행하세요.")
    else:
        failed = [name for name, ok in results if not ok]
        print(f"⚠️  실패 항목: {', '.join(failed)}")
        print("클립보드 폴백 또는 프로젝트 범위 축소를 검토하세요.")

if __name__ == "__main__":
    test()
```

```powershell
python poc_com_test.py
```

### 3-4. 결과 판단

| 결과 | 다음 단계 |
|---|---|
| 5/5 통과 | Phase 1 → Win32HwpAdapter 구현 진행 |
| 3~4개 통과 | 실패 항목 원인 분석 후 우회 방법 탐색 |
| 1~2개 통과 | 클립보드 방식(Ctrl+C/V) 폴백 검토 |
| 0개 통과 | 한/글 버전 확인 또는 hwpx 직접 파싱으로 전환 |

---

## 4. Win32HwpAdapter 구현 (COM PoC 통과 후)

### 4-1. C++ Native Addon 빌드 환경

```powershell
npm install cmake-js node-addon-api --save-dev
```

`native/CMakeLists.txt`는 이미 PRD에 정의되어 있습니다. 핵심:

```cmake
target_link_libraries(${PROJECT_NAME} ${CMAKE_JS_LIB} ole32 oleaut32)
```

### 4-2. 구현할 파일

현재 `src/main/services/hwp-adapter.ts`에 `IHwpAdapter` 인터페이스가 정의되어 있고, `MockHwpAdapter`가 구현되어 있습니다.

**해야 할 일:**

1. `native/src/` 디렉토리에 C++ 코드 작성:
   - `hwp_com.cpp` — COM 자동화 (`CoInitialize` → `CoCreateInstance` → `IDispatch`)
   - `window_manager.cpp` — `FindWindow`, `SetWindowPos`, `GetMonitorInfo`
   - `addon.cpp` — N-API 함수 등록

2. `src/main/services/hwp-adapter.ts`에 `Win32HwpAdapter` 클래스 추가:
   ```typescript
   export class Win32HwpAdapter implements IHwpAdapter {
     private addon: any  // C++ native addon

     constructor() {
       // Windows에서만 로드
       this.addon = require('../../native/build/Release/hwp_native.node')
     }
     // ... IHwpAdapter 메서드 구현
   }
   ```

3. `src/main/index.ts`에서 플랫폼 분기:
   ```typescript
   const hwpAdapter = process.platform === 'win32'
     ? new Win32HwpAdapter()
     : new MockHwpAdapter()
   ```

### 4-3. COM 호출 핵심 매핑

| IHwpAdapter 메서드 | COM 호출 |
|---|---|
| `findHwpWindow()` | `FindWindowW(L"HWP", NULL)` |
| `connect()` | `CoCreateInstance("HWPFrame.HwpObject")` |
| `getFullText()` | `hwp.GetTextFile("TEXT", "")` |
| `getCursorPos()` | `hwp.GetPos()` → `{ page, paragraph, charIndex }` |
| `getTextRange(start, end)` | `MovePos`로 범위 이동 + `GetTextFile` |
| `insertAfterParagraph(idx, text)` | `SetPos` → 문단 끝 이동 → `InsertText` |
| `findAndReplace(idx, search, repl)` | `FindText(search)` → 선택 → `InsertText(repl)` |
| `deleteParagraph(idx)` | 문단 블록 선택 → `Delete` |
| `arrangeWindows(...)` | `GetMonitorInfo` → `SetWindowPos` |

---

## 5. 남은 작업 목록

PROGRESS.md에 전체 체크리스트가 있습니다. Windows에서 해야 할 핵심 작업:

### 필수 (MVP)
1. ✅ Phase 0 COM PoC 검증
2. C++ Native Addon 빌드 (`native/`)
3. `Win32HwpAdapter` 실제 구현
4. `src/main/index.ts`에서 플랫폼 분기 추가
5. 실제 HWP로 E2E 수동 테스트

### 권장
6. API 키 `safeStorage` 암호화 저장
7. CSP 헤더 설정
8. electron-builder로 NSIS 인스톨러 생성
9. electron-log 로깅 설정
10. 단일 인스턴스 강제

### 테스트
11. Unit 테스트 작성 (edit-parser, diff)
12. Integration 테스트 (DB CRUD, AI 모킹)

---

## 6. 빠른 시작 요약

```powershell
# 1. 클론
git clone https://github.com/veryhungryface/hwpx-control.git
cd hwpx-control

# 2. 설치
npm install

# 3. Mock 모드로 앱 실행 확인
npm run dev

# 4. COM PoC 검증 (한/글 실행 상태에서)
pip install pywin32
python poc_com_test.py

# 5. PoC 통과 후 → Win32HwpAdapter 구현 시작
# 6. 실제 HWP 연동 테스트
# 7. 빌드 & 패키징
npx electron-vite build
```
