# -*- coding: utf-8 -*-
"""
COM으로 편집 → 저장 → 사용자 HWP에서 닫기+다시열기
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
import win32api

sys.stdout.reconfigure(encoding='utf-8')

def log(msg):
    print(f"[TEST] {msg}", flush=True)

def get_info():
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

def send_key(vk, shift=False, ctrl=False, alt=False):
    """키 전송"""
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
    time.sleep(0.05)

def main():
    pythoncom.CoInitialize()
    doc_path, hwp_hwnd = get_info()
    log(f"문서: {doc_path}")
    log(f"HWP hwnd: {hwp_hwnd}")

    if not doc_path or not hwp_hwnd:
        log("문서/창 못 찾음!")
        return

    # 1. COM으로 문서 편집 + 저장
    log("\n=== 1. COM 편집 + 저장 ===")
    hwp = win32com.client.Dispatch("HWPFrame.HwpObject")
    try:
        hwp.RegisterModule("FilePathCheckDLL", "FilePathCheckerModuleExample")
    except:
        pass
    hwp.Open(doc_path)
    text_before = hwp.GetTextFile("TEXT", "")
    log(f"  원본 텍스트: {len(text_before)} chars")

    # 녹색 텍스트 삽입
    hwp.MovePos(2)
    act_cs = hwp.CreateAction("CharShape")
    pset_cs = act_cs.CreateSet()
    act_cs.GetDefault(pset_cs)
    pset_cs.SetItem("TextColor", 0x0000FF00)
    act_cs.Execute(pset_cs)

    act = hwp.CreateAction("InsertText")
    pset = act.CreateSet()
    pset.SetItem("Text", "[AI 제안] 이 녹색 텍스트가 보여야 합니다!\r\n")
    act.Execute(pset)

    act_cs2 = hwp.CreateAction("CharShape")
    pset_cs2 = act_cs2.CreateSet()
    act_cs2.GetDefault(pset_cs2)
    pset_cs2.SetItem("TextColor", 0x00000000)
    act_cs2.Execute(pset_cs2)

    hwp.Save()
    log(f"  편집 + 저장 완료!")

    # COM 컨텍스트의 문서 닫기 (파일은 이미 디스크에 저장됨)
    hwp.HAction.Run("FileClose")
    log(f"  COM 문서 닫기 완료")

    # 2. 사용자 HWP 창에서 "되돌리기" (파일 → 되돌리기)
    log("\n=== 2. HWP 창에서 되돌리기 ===")
    win32gui.SetForegroundWindow(hwp_hwnd)
    time.sleep(0.5)

    # HWP에서 Ctrl+Shift+Z 또는 Alt+파일→되돌리기
    # Alt+J 로 파일 메뉴를 열 수 있을 수도 있음
    # 직접 Alt 메뉴 접근
    log("  Alt+J (파일 메뉴) 시도...")
    send_key(0x4A, alt=True)  # Alt+J (한글 HWP에서 파일 메뉴)
    time.sleep(0.5)

    # 되돌리기 메뉴 선택 시도
    # HWP 메뉴에서 되돌리기는 보통 'V' 키
    log("  V (되돌리기) 시도...")
    send_key(0x56)  # V
    time.sleep(0.5)

    # 확인 대화상자에서 Enter
    send_key(0x0D)  # Enter
    time.sleep(1)

    log("  HWP에 녹색 텍스트가 보이나요? (10초 대기)")
    time.sleep(10)

    # 3. 정리: COM으로 다시 원본 복원
    log("\n=== 3. 정리: 원본 복원 ===")
    hwp2 = win32com.client.Dispatch("HWPFrame.HwpObject")
    try:
        hwp2.RegisterModule("FilePathCheckDLL", "FilePathCheckerModuleExample")
    except:
        pass
    hwp2.Open(doc_path)
    for _ in range(5):
        hwp2.HAction.Run("Undo")
    hwp2.Save()
    hwp2.HAction.Run("FileClose")
    log("  원본 복원 + 저장 완료")

    # HWP 창 다시 되돌리기
    time.sleep(0.5)
    win32gui.SetForegroundWindow(hwp_hwnd)
    time.sleep(0.3)
    send_key(0x4A, alt=True)  # Alt+J
    time.sleep(0.3)
    send_key(0x56)  # V
    time.sleep(0.3)
    send_key(0x0D)  # Enter
    time.sleep(1)

    log("\n=== 테스트 완료 ===")

if __name__ == "__main__":
    main()
