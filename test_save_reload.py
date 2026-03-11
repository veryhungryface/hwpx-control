# -*- coding: utf-8 -*-
"""
COM에서 문서를 편집하고 저장 → HWP 창에 다시 열기 시도
"""
import sys
import os
import re
import time
import ctypes
from ctypes import wintypes
import pythoncom
import win32com.client
import win32gui
import win32con

sys.stdout.reconfigure(encoding='utf-8')

def log(msg):
    print(f"[TEST] {msg}", flush=True)

def get_doc_path():
    user32 = ctypes.windll.user32
    doc_path = None
    hwp_hwnd = None
    def enum_cb(hwnd, _):
        nonlocal doc_path, hwp_hwnd
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
                    hwp_hwnd = hwnd
        return True
    WNDENUMPROC = ctypes.WINFUNCTYPE(ctypes.c_bool, wintypes.HWND, wintypes.LPARAM)
    user32.EnumWindows(WNDENUMPROC(enum_cb), 0)
    return doc_path, hwp_hwnd

def main():
    pythoncom.CoInitialize()
    doc_path, hwp_hwnd = get_doc_path()
    log(f"문서: {doc_path}")
    log(f"HWP hwnd: {hwp_hwnd}")

    if not doc_path:
        log("문서 못 찾음!")
        return

    # 1. COM으로 문서 열기
    log("\n=== COM 문서 열기 ===")
    hwp = win32com.client.Dispatch("HWPFrame.HwpObject")
    try:
        hwp.RegisterModule("FilePathCheckDLL", "FilePathCheckerModuleExample")
    except:
        pass

    hwp.Open(doc_path)
    text = hwp.GetTextFile("TEXT", "")
    log(f"  text: {len(text)} chars")
    log(f"  pages: {hwp.PageCount}")

    # 2. 녹색 텍스트 삽입
    log("\n=== 녹색 텍스트 삽입 ===")
    hwp.MovePos(2)  # 문서 시작

    act_cs = hwp.CreateAction("CharShape")
    pset_cs = act_cs.CreateSet()
    act_cs.GetDefault(pset_cs)
    pset_cs.SetItem("TextColor", 0x0000FF00)
    act_cs.Execute(pset_cs)

    act = hwp.CreateAction("InsertText")
    pset = act.CreateSet()
    pset.SetItem("Text", "[AI 제안] 이 텍스트는 녹색이어야 합니다.\r\n")
    act.Execute(pset)

    act_cs2 = hwp.CreateAction("CharShape")
    pset_cs2 = act_cs2.CreateSet()
    act_cs2.GetDefault(pset_cs2)
    pset_cs2.SetItem("TextColor", 0x00000000)
    act_cs2.Execute(pset_cs2)

    log(f"  삽입 완료!")

    # 3. COM에서 저장
    log("\n=== COM에서 저장 ===")
    try:
        # SaveAs 대신 Save 사용 (같은 경로에 저장)
        hwp.Save()
        log(f"  Save 성공!")
    except Exception as e:
        log(f"  Save 실패: {e}")
        # SaveAs 시도
        try:
            hwp.SaveAs(doc_path)
            log(f"  SaveAs 성공!")
        except Exception as e2:
            log(f"  SaveAs도 실패: {e2}")

    # 4. 사용자의 HWP 창에 리로드 시그널 보내기
    log("\n=== HWP 창에 리로드 시도 ===")

    # 방법 1: HWP 창을 포그라운드로 가져오기
    try:
        ctypes.windll.user32.SetForegroundWindow(hwp_hwnd)
        time.sleep(0.5)
    except:
        pass

    # 방법 2: F5 키 보내기 (HWP에서 새로고침)
    log("  F5 키 전송...")
    try:
        # 포그라운드로 가져온 후 키 입력
        import win32api
        VK_F5 = 0x74
        win32api.keybd_event(VK_F5, 0, 0, 0)
        time.sleep(0.1)
        win32api.keybd_event(VK_F5, 0, win32con.KEYEVENTF_KEYUP, 0)
        time.sleep(1)
    except Exception as e:
        log(f"  F5 실패: {e}")

    # 방법 3: Ctrl+F5 (다시 열기 / 되돌리기)
    log("  Ctrl+F5 키 전송...")
    try:
        import win32api
        VK_CONTROL = 0x11
        VK_F5 = 0x74
        win32api.keybd_event(VK_CONTROL, 0, 0, 0)
        win32api.keybd_event(VK_F5, 0, 0, 0)
        time.sleep(0.1)
        win32api.keybd_event(VK_F5, 0, win32con.KEYEVENTF_KEYUP, 0)
        win32api.keybd_event(VK_CONTROL, 0, win32con.KEYEVENTF_KEYUP, 0)
        time.sleep(1)
    except Exception as e:
        log(f"  Ctrl+F5 실패: {e}")

    log("\n  HWP 문서에 녹색 텍스트가 보이나요? (10초 대기)")
    time.sleep(10)

    # 5. 정리: Undo해서 원래 상태로 복원
    log("\n=== 정리: 원래 상태 복원 ===")
    for _ in range(5):
        hwp.HAction.Run("Undo")
    hwp.Save()
    log(f"  Undo + Save 완료")

    # COM 문서 닫기
    hwp.HAction.Run("FileClose")

    log("\n=== 테스트 완료 ===")

if __name__ == "__main__":
    main()
