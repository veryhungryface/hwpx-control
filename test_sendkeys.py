# -*- coding: utf-8 -*-
"""
SendKeys로 HWP의 찾기/바꾸기(Ctrl+H) 기능을 직접 조작하여
사용자의 보이는 문서를 수정하는 테스트
"""
import sys
import os
import re
import time
import ctypes
from ctypes import wintypes
import win32gui
import win32con
import win32api
import win32clipboard

sys.stdout.reconfigure(encoding='utf-8')

def log(msg):
    print(f"[TEST] {msg}", flush=True)

def get_hwp_window():
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

def set_clipboard(text):
    """클립보드에 텍스트 설정"""
    win32clipboard.OpenClipboard()
    win32clipboard.EmptyClipboard()
    win32clipboard.SetClipboardText(text, win32clipboard.CF_UNICODETEXT)
    win32clipboard.CloseClipboard()

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
    time.sleep(0.1)

def find_and_replace_sendkeys(hwp_hwnd, search_text, replace_text):
    """
    HWP의 찾기/바꾸기 대화상자를 SendKeys로 조작
    Ctrl+H → 찾기 텍스트 입력 → 바꿀 텍스트 입력 → 모두 바꾸기 → 닫기
    """
    # HWP 창 활성화
    win32gui.SetForegroundWindow(hwp_hwnd)
    time.sleep(0.5)

    # Ctrl+H (찾아 바꾸기 대화상자 열기)
    log("  Ctrl+H 전송...")
    send_key(0x48, ctrl=True)  # Ctrl+H
    time.sleep(1)

    # 찾기 필드에 포커스가 있어야 함
    # 찾기 필드 내용 지우기: Ctrl+A → 텍스트 입력
    send_key(0x41, ctrl=True)  # Ctrl+A (전체 선택)
    time.sleep(0.1)

    # 클립보드에 찾기 텍스트 넣고 붙여넣기
    set_clipboard(search_text)
    send_key(0x56, ctrl=True)  # Ctrl+V (붙여넣기)
    time.sleep(0.2)

    # Tab으로 바꿀 텍스트 필드로 이동
    send_key(0x09)  # Tab
    time.sleep(0.1)

    # 바꿀 텍스트 입력
    send_key(0x41, ctrl=True)  # Ctrl+A
    time.sleep(0.1)
    set_clipboard(replace_text)
    send_key(0x56, ctrl=True)  # Ctrl+V
    time.sleep(0.2)

    # "모두 바꾸기" 버튼 클릭
    # HWP의 찾아 바꾸기 대화상자에서 Alt+A 가 "모두 바꾸기"
    log("  Alt+A (모두 바꾸기)...")
    send_key(0x41, alt=True)  # Alt+A
    time.sleep(0.5)

    # 결과 대화상자 닫기 (Enter)
    send_key(0x0D)  # Enter
    time.sleep(0.3)

    # 찾아 바꾸기 대화상자 닫기 (Escape)
    send_key(0x1B)  # Escape
    time.sleep(0.3)

    log(f"  완료: '{search_text[:30]}' → '{replace_text[:30]}'")

def main():
    hwp_hwnd = get_hwp_window()
    if not hwp_hwnd:
        log("HWP 창 못 찾음!")
        return

    title = win32gui.GetWindowText(hwp_hwnd)
    log(f"HWP 창: hwnd={hwp_hwnd}, '{title}'")

    # 찾아 바꾸기 테스트
    log("\n=== SendKeys 찾아 바꾸기 테스트 ===")
    log("  '1학기 운영 관련 안내' → '1학기 운영 관련 안내 (AI 수정됨)'")

    find_and_replace_sendkeys(
        hwp_hwnd,
        "1학기 운영 관련 안내",
        "1학기 운영 관련 안내 (AI 수정됨)"
    )

    log("\n  HWP 문서에서 변경이 보이나요? (10초 대기)")
    time.sleep(10)

    # 되돌리기: 원래 텍스트로 복원
    log("\n=== 되돌리기 ===")
    find_and_replace_sendkeys(
        hwp_hwnd,
        "1학기 운영 관련 안내 (AI 수정됨)",
        "1학기 운영 관련 안내"
    )

    log("\n=== 테스트 완료 ===")

if __name__ == "__main__":
    main()
