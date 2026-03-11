# -*- coding: utf-8 -*-
"""
HWP COM Bridge — Node.js와 stdin/stdout JSON-RPC로 통신하는 장기 실행 프로세스.
Electron Main Process에서 spawn하여 IHwpAdapter 메서드를 위임받는다.
ROT (Running Object Table) 기반으로 기존 HWP 인스턴스에 연결한다.
"""
import sys
import json
import re
import os
import time
import traceback
import zipfile
import xml.etree.ElementTree as ET

# stdout을 UTF-8로 강제
sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')

# ──────────────────────────────────────────────────────
# COM 래퍼
# ──────────────────────────────────────────────────────

class HwpBridge:
    def __init__(self):
        self.hwp = None
        self.connected = False
        self._com_initialized = False
        self._doc_path = None  # 현재 문서 경로
        self._undo_count = 0   # 인라인 편집 Undo 카운트
        self._edit_session_active = False  # 인라인 편집 세션 활성화 여부

    def _log(self, msg):
        """디버그 로그 → stderr (Electron이 캡처)"""
        sys.stderr.write(f"[hwp_bridge] {msg}\n")
        sys.stderr.flush()

    def _ensure_com(self):
        """COM 아파트먼트 초기화 (서브프로세스에서 필수)"""
        if not self._com_initialized:
            import pythoncom
            pythoncom.CoInitialize()
            self._com_initialized = True
            self._log("COM initialized (STA)")

    def _ensure_hwp_com(self):
        """HWP COM 객체 연결 — ROT 항목에 Open(doc_path) 호출"""
        if self.hwp:
            # 이미 연결됨 — 유효성 확인
            try:
                _ = self.hwp.PageCount
                return True
            except Exception:
                self._log("COM object stale, reconnecting...")
                self.hwp = None

        self._ensure_com()
        import pythoncom
        import win32com.client

        doc_path = self._doc_path
        if not doc_path or not os.path.exists(doc_path):
            self._log("COM: no doc_path available")
            return False

        # ROT에서 HWP 객체를 찾아 Open(doc_path)으로 활성화
        # (원래 HWP 인스턴스에 연결하기 위해 Open 필수)
        try:
            ctx = pythoncom.CreateBindCtx(0)
            rot = pythoncom.GetRunningObjectTable()
            for moniker in rot.EnumRunning():
                try:
                    name = moniker.GetDisplayName(ctx, None)
                    if not name.startswith('!HwpObject'):
                        continue
                    obj = rot.GetObject(moniker)
                    hwp = win32com.client.Dispatch(
                        obj.QueryInterface(pythoncom.IID_IDispatch)
                    )
                    try:
                        hwp.RegisterModule("FilePathCheckDLL", "FilePathCheckerModuleExample")
                    except Exception:
                        pass

                    # Open으로 문서 접근 활성화 (이미 열려 있어도 OK)
                    hwp.Open(doc_path)
                    text = hwp.GetTextFile("TEXT", "")
                    if text and len(text) > 50:
                        self.hwp = hwp
                        self._log(f"COM: Connected via ROT+Open '{name}', {len(text)} chars")
                        return True
                except Exception:
                    continue
        except Exception as e:
            self._log(f"COM ROT+Open failed: {e}")

        # 폴백: Dispatch + Open
        try:
            hwp = win32com.client.Dispatch("HWPFrame.HwpObject")
            try:
                hwp.RegisterModule("FilePathCheckDLL", "FilePathCheckerModuleExample")
            except Exception:
                pass
            hwp.Open(doc_path)
            text = hwp.GetTextFile("TEXT", "")
            if text and len(text) > 50:
                self.hwp = hwp
                self._log(f"COM: Connected via Dispatch+Open, {len(text)} chars")
                return True
            self.hwp = hwp
            self._log("COM: Connected via Dispatch (no document text)")
            return True
        except Exception as e:
            self._log(f"COM creation FAILED: {e}")
            return False

    # ── 연결 ──────────────────────────────────────────

    def connect(self):
        """HWP 창 감지 + COM 연결"""
        try:
            info = self.find_hwp_window()
            if not info:
                self.connected = False
                self._log("connect: no HWP window found")
                return {"success": False, "error": "HWP window not found"}

            # 창 제목에서 문서 경로 추출
            self._doc_path = self._get_doc_path()

            # COM 객체 즉시 연결 (인라인 편집용)
            com_ok = self._ensure_hwp_com()

            self.connected = True
            self._log(f"connect() success - doc_path={self._doc_path}, com={com_ok}")
            return {"success": True}
        except Exception as e:
            self.connected = False
            self._log(f"connect() FAILED: {e}")
            return {"success": False, "error": str(e)}

    def disconnect(self):
        self.hwp = None
        self.connected = False
        return {"success": True}

    def is_connected(self):
        return {"connected": self.connected}

    # ── HWP 프로세스 감지 ─────────────────────────────

    def find_hwp_window(self):
        try:
            import ctypes
            from ctypes import wintypes

            user32 = ctypes.windll.user32

            # EnumWindows로 모든 HWP 창 수집
            candidates = []

            def enum_callback(hwnd, _):
                if not user32.IsWindowVisible(hwnd):
                    return True
                length = user32.GetWindowTextLengthW(hwnd)
                if length == 0:
                    return True
                buf = ctypes.create_unicode_buffer(length + 1)
                user32.GetWindowTextW(hwnd, buf, length + 1)
                title = buf.value
                class_buf = ctypes.create_unicode_buffer(256)
                user32.GetClassNameW(hwnd, class_buf, 256)
                class_name = class_buf.value

                if class_name.startswith("HWP") or "한글" in title or "Hangul" in title:
                    pid = wintypes.DWORD()
                    user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
                    candidates.append({
                        "hwnd": hwnd,
                        "pid": pid.value,
                        "title": title
                    })
                return True  # 모든 창 수집

            WNDENUMPROC = ctypes.WINFUNCTYPE(ctypes.c_bool, wintypes.HWND, wintypes.LPARAM)
            user32.EnumWindows(WNDENUMPROC(enum_callback), 0)

            if not candidates:
                self._log("findHwpWindow: no HWP window found")
                return None

            # 실제 문서가 열려 있는 창 우선 (파일 경로 포함, "빈 문서" 제외)
            for c in candidates:
                title = c["title"]
                if ("[" in title and "]" in title) or (".hwp" in title.lower()):
                    self._log(f"findHwpWindow: found hwnd={c['hwnd']} title='{c['title']}'")
                    return c

            # 문서 경로가 없어도 첫 번째 HWP 창 반환
            result = candidates[0]
            self._log(f"findHwpWindow: found hwnd={result['hwnd']} title='{result['title']}'")
            return result
        except Exception as e:
            self._log(f"findHwpWindow ERROR: {e}")
            return None

    # ── 문서 경로/hwpx 파싱 ──────────────────────────

    def _get_doc_path(self):
        """현재 문서의 파일 경로를 반환 (창 제목에서 추출)"""
        info = self.find_hwp_window()
        if not info:
            return None
        title = info.get("title", "")
        # 패턴: "파일명.hwpx [경로\] - 한글" 또는 "파일명.hwp [경로\] - 한글"
        m = re.match(r'^(.+?)\s*\[(.+?)[\\/]?\]\s*-\s*한글', title)
        if m:
            filename = m.group(1).strip()
            directory = m.group(2).strip()
            full_path = os.path.join(directory, filename)
            if os.path.exists(full_path):
                self._log(f"_get_doc_path: {full_path}")
                return full_path
        # 패턴2: "파일명 - 한글" (경로 없음)
        m = re.match(r'^(.+?)\s*-\s*한글', title)
        if m:
            filename = m.group(1).strip()
            self._log(f"_get_doc_path: filename only '{filename}', no full path")
        return None

    def _parse_hwpx_text(self, hwpx_path):
        """hwpx 파일에서 텍스트 추출 (XML 파싱)"""
        try:
            ns = {
                'hp': 'http://www.hancom.co.kr/hwpml/2011/paragraph',
                'hs': 'http://www.hancom.co.kr/hwpml/2011/section',
            }
            all_lines = []
            with zipfile.ZipFile(hwpx_path, 'r') as z:
                # section 파일 목록 (section0.xml, section1.xml, ...)
                section_files = sorted(
                    [n for n in z.namelist() if re.match(r'Contents/section\d+\.xml', n)]
                )
                if not section_files:
                    # PrvText.txt 폴백
                    if 'Preview/PrvText.txt' in z.namelist():
                        text = z.read('Preview/PrvText.txt').decode('utf-8')
                        self._log(f"_parse_hwpx_text: PrvText.txt fallback, {len(text)} chars")
                        return text
                    return ""

                for sf in section_files:
                    content = z.read(sf).decode('utf-8')
                    root = ET.fromstring(content)
                    for p in root.findall('.//hp:p', ns):
                        texts = []
                        for t in p.findall('.//hp:t', ns):
                            if t.text:
                                texts.append(t.text)
                        line = ''.join(texts).strip()
                        # 빈 줄도 문단으로 유지 (문단 인덱스 정확성)
                        all_lines.append(line)

            result = '\r\n'.join(all_lines)
            self._log(f"_parse_hwpx_text: {len(all_lines)} paragraphs, {len(result)} chars")
            return result
        except Exception as e:
            self._log(f"_parse_hwpx_text ERROR: {e}")
            return ""

    # ── 문서 읽기 ─────────────────────────────────────

    def _parse_html_to_text(self, html):
        """HTML에서 텍스트만 추출 (GetTextFile("TEXT") 실패 시 폴백)"""
        body_match = re.search(r'<body[^>]*>(.*?)</body>', html, re.DOTALL)
        if not body_match:
            return ""
        body = body_match.group(1)
        # <p> 태그 단위로 분리하여 문단 구분
        # 각 <p>...</p>를 하나의 문단으로 처리
        paragraphs = re.findall(r'<p[^>]*>(.*?)</p>', body, re.DOTALL)
        lines = []
        for p in paragraphs:
            # HTML 태그 제거
            clean = re.sub(r'<[^>]+>', '', p)
            # HTML 엔티티 디코딩
            clean = clean.replace('&nbsp;', ' ').replace('&lt;', '<')
            clean = clean.replace('&gt;', '>').replace('&amp;', '&')
            clean = clean.replace('&quot;', '"').replace('&#39;', "'")
            clean = clean.strip()
            lines.append(clean)
        return '\r\n'.join(lines)

    def get_full_text(self):
        if not self.connected:
            self._log("get_full_text: not connected")
            return {"error": "Not connected"}

        # COM 우선 (ROT 연결 후에는 정상 동작)
        if self.hwp:
            try:
                text = self.hwp.GetTextFile("TEXT", "")
                if text and text.strip():
                    self._log(f"get_full_text: COM TEXT, {len(text)} chars")
                    return {"text": text}
            except Exception:
                pass

        # hwpx 파일 직접 파싱 폴백
        doc_path = self._doc_path or self._get_doc_path()
        if doc_path and doc_path.lower().endswith('.hwpx'):
            text = self._parse_hwpx_text(doc_path)
            if text and text.strip():
                self._log(f"get_full_text: hwpx direct parse, {len(text)} chars")
                return {"text": text}

        self._log("get_full_text: all methods returned empty")
        return {"text": ""}

    def get_cursor_pos(self):
        if not self.connected:
            return {"error": "Not connected"}
        if self.hwp:
            try:
                pos = self.hwp.GetPos()
                # 페이지 번호 추정 (문단 기반)
                page = max(1, (pos[1] // 30) + 1) if pos[1] > 0 else 1
                return {
                    "listId": pos[0],
                    "paragraph": pos[1] + 1,  # 1-based로 변환
                    "charIndex": pos[2],
                    "page": page
                }
            except Exception as e:
                self._log(f"getCursorPos error: {e}")
        return {"listId": 0, "paragraph": 1, "charIndex": 0, "page": 1}

    def get_total_pages(self):
        if not self.connected:
            return {"error": "Not connected"}
        if self.hwp:
            try:
                return {"pages": self.hwp.PageCount}
            except Exception:
                pass
        # 텍스트 기반 추정 폴백
        text = self._get_all_text()
        if not text:
            return {"pages": 1}
        lines = text.split('\r\n')
        return {"pages": max(1, len(lines) // 30 + 1)}

    def _get_all_text(self):
        """모든 텍스트 읽기 (COM → hwpx 폴백)"""
        if self.hwp:
            try:
                text = self.hwp.GetTextFile("TEXT", "")
                if text and text.strip():
                    return text
            except Exception:
                pass
        # hwpx 파일 직접 파싱 폴백
        doc_path = self._doc_path or self._get_doc_path()
        if doc_path and doc_path.lower().endswith('.hwpx'):
            text = self._parse_hwpx_text(doc_path)
            if text and text.strip():
                return text
        return ""

    def get_text_range(self, start_page, end_page):
        """전체 텍스트를 읽어서 페이지 범위에 해당하는 부분을 반환"""
        if not self.connected:
            return {"error": "Not connected"}
        try:
            text = self._get_all_text()
            return {"text": text}
        except Exception as e:
            return {"error": str(e)}

    def get_selected_text(self):
        if not self.hwp or not self.connected:
            return {"text": None}
        try:
            text = self.hwp.GetTextFile("TEXT", "saveblock")
            return {"text": text}
        except Exception:
            return {"text": None}

    def get_paragraph_text(self, paragraph_index):
        """1-based 문단 인덱스로 특정 문단 텍스트 반환"""
        if not self.connected:
            return {"error": "Not connected"}
        try:
            text = self._get_all_text()
            if not text:
                return {"text": ""}
            paragraphs = text.split('\r\n')
            idx = paragraph_index - 1
            if 0 <= idx < len(paragraphs):
                return {"text": paragraphs[idx]}
            return {"text": ""}
        except Exception as e:
            return {"error": str(e)}

    # ── SendKeys 헬퍼 ─────────────────────────────────

    def _get_hwp_hwnd(self):
        """보이는 HWP 창의 hwnd 반환"""
        import ctypes
        from ctypes import wintypes

        user32 = ctypes.windll.user32
        hwp_hwnd = None

        def enum_cb(hwnd, _):
            nonlocal hwp_hwnd
            if not user32.IsWindowVisible(hwnd):
                return True
            length = user32.GetWindowTextLengthW(hwnd)
            if length == 0:
                return True
            buf = ctypes.create_unicode_buffer(length + 1)
            user32.GetWindowTextW(hwnd, buf, length + 1)
            title = buf.value
            if "한글" in title and ("[" in title or ".hwp" in title.lower()):
                hwp_hwnd = hwnd
            return True

        WNDENUMPROC = ctypes.WINFUNCTYPE(ctypes.c_bool, wintypes.HWND, wintypes.LPARAM)
        user32.EnumWindows(WNDENUMPROC(enum_cb), 0)
        return hwp_hwnd

    def _set_clipboard(self, text):
        """클립보드에 텍스트 설정"""
        import win32clipboard
        win32clipboard.OpenClipboard()
        win32clipboard.EmptyClipboard()
        win32clipboard.SetClipboardText(text, win32clipboard.CF_UNICODETEXT)
        win32clipboard.CloseClipboard()

    def _send_key(self, vk, shift=False, ctrl=False, alt=False):
        """키 전송"""
        import win32api
        import win32con
        if alt:
            win32api.keybd_event(0x12, 0, 0, 0)
        if ctrl:
            win32api.keybd_event(0x11, 0, 0, 0)
        if shift:
            win32api.keybd_event(0x10, 0, 0, 0)
        win32api.keybd_event(vk, 0, 0, 0)
        time.sleep(0.02)
        win32api.keybd_event(vk, 0, win32con.KEYEVENTF_KEYUP, 0)
        if shift:
            win32api.keybd_event(0x10, 0, win32con.KEYEVENTF_KEYUP, 0)
        if ctrl:
            win32api.keybd_event(0x11, 0, win32con.KEYEVENTF_KEYUP, 0)
        if alt:
            win32api.keybd_event(0x12, 0, win32con.KEYEVENTF_KEYUP, 0)
        time.sleep(0.1)

    def _find_and_replace_sendkeys(self, hwp_hwnd, search_text, replace_text):
        """SendKeys로 HWP의 찾기/바꾸기(Ctrl+H) 실행 — 보이는 문서에서 직접 동작"""
        import win32gui

        # HWP 창 활성화
        win32gui.SetForegroundWindow(hwp_hwnd)
        time.sleep(0.5)

        # Ctrl+H (찾아 바꾸기 대화상자)
        self._send_key(0x48, ctrl=True)
        time.sleep(1)

        # 찾기 필드: Ctrl+A → 클립보드 붙여넣기
        self._send_key(0x41, ctrl=True)
        time.sleep(0.1)
        self._set_clipboard(search_text)
        self._send_key(0x56, ctrl=True)
        time.sleep(0.2)

        # Tab → 바꿀 텍스트 필드
        self._send_key(0x09)
        time.sleep(0.1)

        # 바꿀 텍스트 필드: Ctrl+A → 입력
        self._send_key(0x41, ctrl=True)
        time.sleep(0.1)
        if replace_text:
            self._set_clipboard(replace_text)
            self._send_key(0x56, ctrl=True)
        else:
            # 빈 문자열이면 필드 내용 삭제
            self._send_key(0x2E)  # Delete key
        time.sleep(0.2)

        # Alt+A (모두 바꾸기)
        self._send_key(0x41, alt=True)
        time.sleep(0.5)

        # Enter (결과 대화상자 닫기)
        self._send_key(0x0D)
        time.sleep(0.3)

        # Escape (찾아 바꾸기 대화상자 닫기)
        self._send_key(0x1B)
        time.sleep(0.3)

        self._log(f"  SendKeys replace: '{search_text[:30]}' → '{replace_text[:30]}'")

    # ── 인라인 편집 (SendKeys 기반) ────────────────────

    def apply_inline_edits(self, edits):
        """SendKeys로 HWP의 보이는 문서를 직접 편집 (찾기/바꾸기)
        edits: [{"action": "replace"|"delete", "paragraph": N, "search": "...", "text": "..."}]
        """
        hwp_hwnd = self._get_hwp_hwnd()
        if not hwp_hwnd:
            return {"error": "HWP window not found"}

        applied = 0
        failed = 0
        errors = []
        self._undo_count = 0

        for edit in edits:
            action = edit.get('action')
            try:
                if action == 'replace':
                    search_text = edit.get('search', '')
                    new_text = edit.get('text', '')
                    if not search_text or not new_text:
                        failed += 1
                        errors.append("replace: search/text missing")
                        continue
                    self._find_and_replace_sendkeys(hwp_hwnd, search_text, new_text)
                    self._undo_count += 1
                    applied += 1

                elif action == 'delete':
                    search_text = edit.get('search', '')
                    if not search_text:
                        failed += 1
                        errors.append("delete: search text missing")
                        continue
                    self._find_and_replace_sendkeys(hwp_hwnd, search_text, '')
                    self._undo_count += 1
                    applied += 1

                elif action == 'insert':
                    # insert는 SendKeys 찾기/바꾸기로 직접 지원 어려움
                    # → 텍스트 앵커가 있으면 앵커 뒤에 추가
                    search_text = edit.get('search', '')
                    new_text = edit.get('text', '')
                    if search_text and new_text:
                        # 앵커 텍스트 뒤에 새 텍스트 추가
                        self._find_and_replace_sendkeys(
                            hwp_hwnd, search_text, search_text + '\r\n' + new_text
                        )
                        self._undo_count += 1
                        applied += 1
                    else:
                        failed += 1
                        errors.append("insert: search (anchor) and text required")
                else:
                    failed += 1
                    errors.append(f"unknown action: {action}")

            except Exception as e:
                failed += 1
                errors.append(str(e))
                self._log(f"  SendKeys edit error: {e}")

        self._log(f"apply_inline_edits(SendKeys): applied={applied}, failed={failed}")
        return {"applied": applied, "failed": failed, "errors": errors}

    def accept_inline_edits(self):
        """편집 수락 — SendKeys 방식에서는 이미 문서에 반영됨 (no-op)"""
        self._edit_session_active = False
        self._undo_count = 0
        self._log("accept_inline_edits: no-op (already applied via SendKeys)")
        return {"success": True}

    def reject_inline_edits(self):
        """편집 거절 — SendKeys Ctrl+Z로 되돌리기"""
        hwp_hwnd = self._get_hwp_hwnd()
        if not hwp_hwnd:
            return {"error": "HWP window not found"}

        try:
            import win32gui
            win32gui.SetForegroundWindow(hwp_hwnd)
            time.sleep(0.3)

            count = self._undo_count
            for _ in range(count):
                self._send_key(0x5A, ctrl=True)  # Ctrl+Z
                time.sleep(0.2)

            self._edit_session_active = False
            self._undo_count = 0
            self._log(f"reject_inline_edits: Ctrl+Z × {count}")
            return {"success": True, "undone": count}
        except Exception as e:
            self._log(f"reject_inline_edits ERROR: {e}")
            return {"error": str(e)}

    # ── hwpx 직접 편집 ───────────────────────────────

    def _edit_hwpx(self, edits):
        """hwpx 파일을 직접 수정하여 편집 적용 (COM 불필요)
        edits: [{"action": "insert"|"replace"|"delete", "paragraph": N, "search": "...", "text": "..."}]
        """
        doc_path = self._doc_path or self._get_doc_path()
        if not doc_path or not doc_path.lower().endswith('.hwpx'):
            return {"error": "hwpx file path not available"}

        try:
            import shutil
            import tempfile

            ns = {
                'hp': 'http://www.hancom.co.kr/hwpml/2011/paragraph',
                'hs': 'http://www.hancom.co.kr/hwpml/2011/section',
                'hc': 'http://www.hancom.co.kr/hwpml/2011/core',
                'hh': 'http://www.hancom.co.kr/hwpml/2011/head',
            }
            # Register namespaces to preserve XML
            for prefix, uri in ns.items():
                ET.register_namespace(prefix, uri)
            # Also register common HWP namespaces
            for prefix, uri in [
                ('ha', 'http://www.hancom.co.kr/hwpml/2011/app'),
                ('hp10', 'http://www.hancom.co.kr/hwpml/2016/paragraph'),
                ('hhs', 'http://www.hancom.co.kr/hwpml/2011/history'),
                ('hm', 'http://www.hancom.co.kr/hwpml/2011/master-page'),
                ('hpf', 'http://www.hancom.co.kr/schema/2011/hpf'),
                ('dc', 'http://purl.org/dc/elements/1.1/'),
                ('opf', 'http://www.idpf.org/2007/opf/'),
                ('ooxmlchart', 'http://www.hancom.co.kr/hwpml/2016/ooxmlchart'),
                ('hwpunitchar', 'http://www.hancom.co.kr/hwpml/2016/HwpUnitChar'),
                ('epub', 'http://www.idpf.org/2007/ops'),
                ('config', 'urn:oasis:names:tc:opendocument:xmlns:config:1.0'),
            ]:
                ET.register_namespace(prefix, uri)

            # 백업 생성
            backup_path = doc_path + '.bak'
            shutil.copy2(doc_path, backup_path)
            self._log(f"_edit_hwpx: backup created at {backup_path}")

            # hwpx 열기 및 section XML 수정
            with zipfile.ZipFile(doc_path, 'r') as zin:
                section_files = sorted(
                    [n for n in zin.namelist() if re.match(r'Contents/section\d+\.xml', n)]
                )
                if not section_files:
                    return {"error": "No section files found"}

                # 모든 파일 읽기
                file_contents = {}
                for name in zin.namelist():
                    file_contents[name] = zin.read(name)

            # section0.xml 파싱
            section_xml = file_contents[section_files[0]].decode('utf-8')
            root = ET.fromstring(section_xml)

            # 모든 문단(hp:p) 수집
            paragraphs = root.findall('.//hp:p', ns)

            applied = 0
            failed = 0
            errors = []

            # 편집을 역순으로 적용 (인덱스 이동 방지)
            sorted_edits = sorted(edits, key=lambda e: e.get('paragraph', 0), reverse=True)

            for edit in sorted_edits:
                action = edit.get('action')
                para_idx = edit.get('paragraph', 1) - 1  # 0-based
                try:
                    if action == 'replace' and 0 <= para_idx < len(paragraphs):
                        # 문단의 텍스트 노드 교체
                        p = paragraphs[para_idx]
                        search_text = edit.get('search', '')
                        new_text = edit.get('text', '')
                        replaced = False
                        for t in p.findall('.//hp:t', ns):
                            if t.text and search_text in t.text:
                                t.text = t.text.replace(search_text, new_text)
                                replaced = True
                        if replaced:
                            applied += 1
                        else:
                            # 전체 텍스트를 합쳐서 교체 시도
                            all_t = p.findall('.//hp:t', ns)
                            full = ''.join(t.text or '' for t in all_t)
                            if search_text in full:
                                new_full = full.replace(search_text, new_text)
                                if all_t:
                                    all_t[0].text = new_full
                                    for t in all_t[1:]:
                                        t.text = ''
                                applied += 1
                            else:
                                failed += 1
                                errors.append(f"P{para_idx+1}: search text not found")

                    elif action == 'insert' and 0 <= para_idx < len(paragraphs):
                        # 기존 문단을 복제하여 뒤에 새 문단 삽입
                        ref_p = paragraphs[para_idx]
                        parent = root.find(f'.//{{{ns["hp"]}}}p/..', ns)
                        if parent is None:
                            parent = root
                        # 참조 문단의 인덱스 찾기
                        children = list(parent)
                        ref_idx = None
                        for ci, child in enumerate(children):
                            if child is ref_p:
                                ref_idx = ci
                                break
                        if ref_idx is not None:
                            import copy
                            new_p = copy.deepcopy(ref_p)
                            # 새 문단의 텍스트 교체
                            t_nodes = new_p.findall(f'.//{{{ns["hp"]}}}t')
                            if t_nodes:
                                t_nodes[0].text = edit.get('text', '')
                                for t in t_nodes[1:]:
                                    t.text = ''
                            parent.insert(ref_idx + 1, new_p)
                            applied += 1
                        else:
                            failed += 1
                            errors.append(f"P{para_idx+1}: parent not found for insert")

                    elif action == 'delete' and 0 <= para_idx < len(paragraphs):
                        p = paragraphs[para_idx]
                        parent = root.find(f'.//{{{ns["hp"]}}}p/..', ns)
                        if parent is None:
                            parent = root
                        try:
                            parent.remove(p)
                            applied += 1
                        except ValueError:
                            failed += 1
                            errors.append(f"P{para_idx+1}: could not remove paragraph")
                    else:
                        failed += 1
                        errors.append(f"P{para_idx+1}: invalid action or index")

                except Exception as e:
                    failed += 1
                    errors.append(f"P{para_idx+1}: {str(e)}")

            # 수정된 XML을 hwpx에 다시 저장
            modified_xml = ET.tostring(root, encoding='unicode', xml_declaration=True)
            file_contents[section_files[0]] = modified_xml.encode('utf-8')

            # 임시 파일에 새 zip 쓰기
            tmp_fd, tmp_path = tempfile.mkstemp(suffix='.hwpx')
            os.close(tmp_fd)
            with zipfile.ZipFile(tmp_path, 'w', zipfile.ZIP_DEFLATED) as zout:
                for name, data in file_contents.items():
                    zout.writestr(name, data)

            # 원본 대체
            shutil.move(tmp_path, doc_path)
            self._log(f"_edit_hwpx: applied={applied}, failed={failed}")

            return {"applied": applied, "failed": failed, "errors": errors}

        except Exception as e:
            self._log(f"_edit_hwpx ERROR: {e}")
            return {"error": str(e)}

    def _revert_hwpx(self):
        """hwpx 편집 되돌리기 (백업 복원)"""
        doc_path = self._doc_path or self._get_doc_path()
        if not doc_path:
            return {"error": "doc path not available"}
        backup_path = doc_path + '.bak'
        if not os.path.exists(backup_path):
            return {"error": "backup not found"}
        try:
            import shutil
            shutil.copy2(backup_path, doc_path)
            os.remove(backup_path)
            self._log(f"_revert_hwpx: restored from backup")
            return {"success": True}
        except Exception as e:
            self._log(f"_revert_hwpx ERROR: {e}")
            return {"error": str(e)}

    # ── 문서 편집 ─────────────────────────────────────

    def insert_after_paragraph(self, paragraph_index, text):
        """지정 문단 뒤에 텍스트 삽입"""
        if not self._ensure_hwp_com():
            return {"error": "COM not available"}
        try:
            full_text = self.hwp.GetTextFile("TEXT", "")
            if not full_text:
                paragraphs = []
            else:
                paragraphs = full_text.split('\r\n')

            # 해당 문단 끝으로 이동
            self.hwp.MovePos(2)  # 문서 시작
            for _ in range(paragraph_index):
                self.hwp.MovePos(6)  # 다음 문단

            # 문단 끝으로 이동
            self.hwp.MovePos(8)  # 문단 끝 (줄 끝)

            # 새 줄 삽입 후 텍스트 입력
            act = self.hwp.CreateAction("InsertText")
            pset = act.CreateSet()
            pset.SetItem("Text", "\r\n" + text)
            act.Execute(pset)

            return {"success": True}
        except Exception as e:
            return {"error": str(e)}

    def find_and_replace(self, paragraph_index, search, replacement):
        """특정 문단에서 문자열 교체"""
        if not self._ensure_hwp_com():
            return {"error": "COM not available"}
        try:
            # FindReplace 액션 사용
            act = self.hwp.CreateAction("AllReplace")
            pset = act.CreateSet()
            act.GetDefault(pset)
            pset.SetItem("FindString", search)
            pset.SetItem("ReplaceString", replacement)
            pset.SetItem("IgnoreMessage", 1)  # 대화상자 표시 안 함
            pset.SetItem("FindRegExp", 0)
            pset.SetItem("ReplaceMode", 1)  # 1 = 모두 바꾸기
            act.Execute(pset)

            return {"success": True}
        except Exception as e:
            return {"error": str(e)}

    def delete_paragraph(self, paragraph_index):
        """특정 문단 삭제"""
        if not self._ensure_hwp_com():
            return {"error": "COM not available"}
        try:
            # 해당 문단으로 이동
            self.hwp.MovePos(2)  # 문서 시작
            for _ in range(paragraph_index - 1):
                self.hwp.MovePos(6)  # 다음 문단

            # 문단 시작으로
            self.hwp.MovePos(7)  # 줄 시작

            # 문단 전체 선택 (줄 시작 ~ 다음 줄 시작)
            self.hwp.HAction.Run("MoveSelNextParaBegin")

            # 선택 삭제
            self.hwp.HAction.Run("Delete")

            return {"success": True}
        except Exception as e:
            return {"error": str(e)}

    # ── 창 관리 ───────────────────────────────────────

    def arrange_windows(self, electron_hwnd, ratio, swap):
        """HWP 창과 Electron 창을 좌우 분할 배치"""
        try:
            import ctypes
            from ctypes import wintypes

            user32 = ctypes.windll.user32

            # HWP 창 찾기
            hwp_info = self.find_hwp_window()
            if not hwp_info:
                return {"error": "HWP window not found"}

            hwp_hwnd = hwp_info["hwnd"]

            # HWP가 있는 모니터 정보
            class MONITORINFO(ctypes.Structure):
                _fields_ = [
                    ("cbSize", wintypes.DWORD),
                    ("rcMonitor", wintypes.RECT),
                    ("rcWork", wintypes.RECT),
                    ("dwFlags", wintypes.DWORD),
                ]

            monitor = user32.MonitorFromWindow(hwp_hwnd, 1)  # MONITOR_DEFAULTTONEAREST
            mi = MONITORINFO()
            mi.cbSize = ctypes.sizeof(MONITORINFO)
            user32.GetMonitorInfoW(monitor, ctypes.byref(mi))

            work = mi.rcWork
            total_width = work.right - work.left
            total_height = work.bottom - work.top

            hwp_width = int(total_width * ratio)
            electron_width = total_width - hwp_width

            if swap:
                # Electron 왼쪽, HWP 오른쪽
                user32.SetWindowPos(electron_hwnd, 0,
                    work.left, work.top, electron_width, total_height, 0x0004)
                user32.SetWindowPos(hwp_hwnd, 0,
                    work.left + electron_width, work.top, hwp_width, total_height, 0x0004)
            else:
                # HWP 왼쪽, Electron 오른쪽
                user32.SetWindowPos(hwp_hwnd, 0,
                    work.left, work.top, hwp_width, total_height, 0x0004)
                user32.SetWindowPos(electron_hwnd, 0,
                    work.left + hwp_width, work.top, electron_width, total_height, 0x0004)

            return {"success": True}
        except Exception as e:
            return {"error": str(e)}


# ──────────────────────────────────────────────────────
# JSON-RPC 메인 루프
# ──────────────────────────────────────────────────────

def main():
    bridge = HwpBridge()

    # 명령 → 메서드 매핑
    dispatch = {
        "connect": lambda p: bridge.connect(),
        "disconnect": lambda p: bridge.disconnect(),
        "isConnected": lambda p: bridge.is_connected(),
        "findHwpWindow": lambda p: bridge.find_hwp_window(),
        "getFullText": lambda p: bridge.get_full_text(),
        "getCursorPos": lambda p: bridge.get_cursor_pos(),
        "getTotalPages": lambda p: bridge.get_total_pages(),
        "getTextRange": lambda p: bridge.get_text_range(p.get("startPage", 1), p.get("endPage", 10)),
        "getSelectedText": lambda p: bridge.get_selected_text(),
        "getParagraphText": lambda p: bridge.get_paragraph_text(p["paragraphIndex"]),
        "insertAfterParagraph": lambda p: bridge.insert_after_paragraph(p["paragraphIndex"], p["text"]),
        "findAndReplace": lambda p: bridge.find_and_replace(p["paragraphIndex"], p["search"], p["replacement"]),
        "deleteParagraph": lambda p: bridge.delete_paragraph(p["paragraphIndex"]),
        "arrangeWindows": lambda p: bridge.arrange_windows(p["electronHwnd"], p["ratio"], p["swap"]),
        "editHwpx": lambda p: bridge._edit_hwpx(p.get("edits", [])),
        "revertHwpx": lambda p: bridge._revert_hwpx(),
        # 인라인 편집 (녹색 텍스트)
        "applyInlineEdits": lambda p: bridge.apply_inline_edits(p.get("edits", [])),
        "acceptInlineEdits": lambda p: bridge.accept_inline_edits(),
        "rejectInlineEdits": lambda p: bridge.reject_inline_edits(),
    }

    # 준비 완료 신호
    sys.stdout.write(json.dumps({"ready": True}) + "\n")
    sys.stdout.flush()

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue

        req_id = 0
        try:
            request = json.loads(line)
            cmd = request.get("cmd")
            params = request.get("params", {})
            req_id = request.get("id", 0)

            sys.stderr.write(f"[hwp_bridge] cmd={cmd} id={req_id}\n")
            sys.stderr.flush()

            if cmd == "exit":
                response = {"id": req_id, "result": {"bye": True}}
                sys.stdout.write(json.dumps(response, ensure_ascii=False) + "\n")
                sys.stdout.flush()
                break

            handler = dispatch.get(cmd)
            if handler:
                result = handler(params)
                response = {"id": req_id, "result": result}
            else:
                response = {"id": req_id, "error": f"Unknown command: {cmd}"}

        except Exception as e:
            sys.stderr.write(f"[hwp_bridge] ERROR: {e}\n{traceback.format_exc()}\n")
            sys.stderr.flush()
            response = {"id": req_id, "error": str(e), "traceback": traceback.format_exc()}

        sys.stdout.write(json.dumps(response, ensure_ascii=False) + "\n")
        sys.stdout.flush()


if __name__ == "__main__":
    main()
