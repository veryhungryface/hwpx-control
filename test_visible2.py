# -*- coding: utf-8 -*-
"""원래 HWP 항목(텍스트 없는 것)에 Open + InsertText 테스트"""
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

    log(f"총 {len(entries)}개 ROT 항목\n")

    # 각 항목의 상태 먼저 확인
    for name, obj in entries:
        try:
            hwp = win32com.client.Dispatch(
                obj.QueryInterface(pythoncom.IID_IDispatch)
            )
            try:
                hwp.RegisterModule("FilePathCheckDLL", "FilePathCheckerModuleExample")
            except:
                pass
            text_len = 0
            try:
                t = hwp.GetTextFile("TEXT", "")
                text_len = len(t) if t else 0
            except:
                pass
            pages = 0
            try:
                pages = hwp.PageCount
            except:
                pass
            path = ""
            try:
                path = hwp.Path
            except:
                pass
            log(f"  {name}: pages={pages}, text={text_len}, path='{path}'")
        except:
            pass

    # 텍스트가 없는 항목(원래 HWP)에서 Open + Insert 시도
    log(f"\n=== 원래 HWP 항목에서 Open + Insert 테스트 ===")
    for name, obj in entries:
        try:
            hwp = win32com.client.Dispatch(
                obj.QueryInterface(pythoncom.IID_IDispatch)
            )
            try:
                hwp.RegisterModule("FilePathCheckDLL", "FilePathCheckerModuleExample")
            except:
                pass

            # 텍스트가 이미 있는 항목은 건너뜀 (이전 테스트에서 만든 것)
            text_len = 0
            try:
                t = hwp.GetTextFile("TEXT", "")
                text_len = len(t) if t else 0
            except:
                pass
            if text_len > 50:
                continue

            log(f"\n  시도: {name} (텍스트 {text_len}자)")

            # Open
            if doc_path:
                hwp.Open(doc_path)
                t2 = hwp.GetTextFile("TEXT", "")
                text_len2 = len(t2) if t2 else 0
                pages2 = hwp.PageCount
                log(f"  Open 후: pages={pages2}, text={text_len2}")

                if text_len2 < 50:
                    log(f"  텍스트 없음 — 다음 항목")
                    continue

                # 문서 시작에 텍스트 삽입
                hwp.MovePos(2)

                act_cs = hwp.CreateAction("CharShape")
                pset_cs = act_cs.CreateSet()
                act_cs.GetDefault(pset_cs)
                pset_cs.SetItem("TextColor", 0x0000FF00)
                act_cs.Execute(pset_cs)

                act = hwp.CreateAction("InsertText")
                pset = act.CreateSet()
                pset.SetItem("Text", f"★★★ {name} 테스트 ★★★\r\n")
                act.Execute(pset)

                act_cs2 = hwp.CreateAction("CharShape")
                pset_cs2 = act_cs2.CreateSet()
                act_cs2.GetDefault(pset_cs2)
                pset_cs2.SetItem("TextColor", 0x00000000)
                act_cs2.Execute(pset_cs2)

                log(f"  '{name}'으로 삽입 완료! HWP에서 확인하세요 (10초 대기)")
                time.sleep(10)

                for _ in range(5):
                    hwp.HAction.Run("Undo")
                log(f"  Undo 완료")
                break

        except Exception as e:
            log(f"  {name}: ERROR - {e}")

    log("\n=== 테스트 완료 ===")

if __name__ == "__main__":
    main()
