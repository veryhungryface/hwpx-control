# -*- coding: utf-8 -*-
"""COM 변경이 사용자의 HWP 창에 보이는지 확인하는 테스트
각 ROT 항목에 Open + InsertText를 시도하고 어떤 항목이 실제 화면에 반영되는지 확인"""
import sys
import os
import re
import time
import ctypes
from ctypes import wintypes
import pythoncom
import win32com.client

sys.stdout.reconfigure(encoding='utf-8')

def log(msg):
    print(f"[TEST] {msg}", flush=True)

def get_doc_path():
    user32 = ctypes.windll.user32
    doc_path = None
    def enum_cb(hwnd, _):
        nonlocal doc_path
        if not user32.IsWindowVisible(hwnd):
            return True
        length = user32.GetWindowTextLengthW(hwnd)
        if length == 0:
            return True
        buf = ctypes.create_unicode_buffer(length + 1)
        user32.GetWindowTextW(hwnd, buf, length + 1)
        title = buf.value
        if "한글" in title and "[" in title:
            m = re.match(r'^(.+?)\s*\[(.+?)[\\/]?\]\s*-\s*한글', title)
            if m:
                p = os.path.join(m.group(2).strip(), m.group(1).strip())
                if os.path.exists(p):
                    doc_path = p
        return True
    WNDENUMPROC = ctypes.WINFUNCTYPE(ctypes.c_bool, wintypes.HWND, wintypes.LPARAM)
    user32.EnumWindows(WNDENUMPROC(enum_cb), 0)
    return doc_path

def main():
    pythoncom.CoInitialize()
    doc_path = get_doc_path()
    log(f"문서 경로: {doc_path}")

    ctx = pythoncom.CreateBindCtx(0)
    rot = pythoncom.GetRunningObjectTable()

    entries = []
    for moniker in rot.EnumRunning():
        try:
            name = moniker.GetDisplayName(ctx, None)
            if name.startswith('!HwpObject'):
                obj = rot.GetObject(moniker)
                entries.append((name, obj))
        except:
            pass

    log(f"총 {len(entries)}개 ROT 항목")

    # 각 고유한 COM 포인터별로 1개만 테스트
    tested = set()
    for name, obj in entries:
        obj_id = id(obj)
        if obj_id in tested:
            continue
        tested.add(obj_id)

        try:
            hwp = win32com.client.Dispatch(
                obj.QueryInterface(pythoncom.IID_IDispatch)
            )
            try:
                hwp.RegisterModule("FilePathCheckDLL", "FilePathCheckerModuleExample")
            except:
                pass

            # 기본 상태 확인
            path = ""
            try:
                path = hwp.Path
            except:
                pass
            pages = 0
            try:
                pages = hwp.PageCount
            except:
                pass
            text_len = 0
            try:
                t = hwp.GetTextFile("TEXT", "")
                text_len = len(t) if t else 0
            except:
                pass

            log(f"\n'{name}': path='{path}', pages={pages}, text={text_len}")

            # Open 호출
            if doc_path:
                try:
                    hwp.Open(doc_path)
                    t2 = hwp.GetTextFile("TEXT", "")
                    text_len2 = len(t2) if t2 else 0
                    pages2 = hwp.PageCount
                    log(f"  Open 후: pages={pages2}, text={text_len2}")
                except Exception as e:
                    log(f"  Open 실패: {e}")
                    continue

                if text_len2 < 50:
                    continue

                # 문서 시작에 눈에 띄는 텍스트 삽입
                log(f"  >>> '{name}'에 텍스트 삽입 테스트 (10초 대기)")
                hwp.MovePos(2)  # 문서 시작

                # 녹색 CharShape
                act_cs = hwp.CreateAction("CharShape")
                pset_cs = act_cs.CreateSet()
                act_cs.GetDefault(pset_cs)
                pset_cs.SetItem("TextColor", 0x0000FF00)
                act_cs.Execute(pset_cs)

                # 큰 텍스트 삽입
                act = hwp.CreateAction("InsertText")
                pset = act.CreateSet()
                pset.SetItem("Text", "★★★ AI 녹색 테스트 ★★★\r\n")
                act.Execute(pset)

                # 색 복원
                act_cs2 = hwp.CreateAction("CharShape")
                pset_cs2 = act_cs2.CreateSet()
                act_cs2.GetDefault(pset_cs2)
                pset_cs2.SetItem("TextColor", 0x00000000)
                act_cs2.Execute(pset_cs2)

                log(f"  삽입 완료! HWP 문서 맨 위에 '★★★ AI 녹색 테스트 ★★★' 보이나요?")
                log(f"  10초 후 자동 Undo됩니다...")
                time.sleep(10)

                # Undo
                for _ in range(5):
                    hwp.HAction.Run("Undo")
                log(f"  Undo 완료")
                break  # 첫 번째 성공한 항목만 테스트

        except Exception as e:
            log(f"  '{name}': ERROR - {e}")

    log("\n=== 테스트 완료 ===")

if __name__ == "__main__":
    main()
