# -*- coding: utf-8 -*-
"""
COM으로 파일 수정 → 저장 → HWP 창에 되돌리기(Revert) 명령 전송
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
    edit_hwnd = None

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

    # 편집 창 찾기
    if hwp_hwnd:
        def enum_child(hwnd, _):
            nonlocal edit_hwnd
            class_buf = ctypes.create_unicode_buffer(256)
            user32.GetClassNameW(hwnd, class_buf, 256)
            if class_buf.value == 'HwpMainEditWnd':
                edit_hwnd = hwnd
            return True
        WNDENUMPROC2 = ctypes.WINFUNCTYPE(ctypes.c_bool, wintypes.HWND, wintypes.LPARAM)
        user32.EnumChildWindows(hwp_hwnd, WNDENUMPROC2(enum_child), 0)

    return doc_path, hwp_hwnd, edit_hwnd

def send_keys_to_hwp(hwp_hwnd):
    """HWP 창에 키 시퀀스 전송"""
    # HWP 창을 포그라운드로
    win32gui.SetForegroundWindow(hwp_hwnd)
    time.sleep(0.3)

    # Ctrl+Z (실행 취소) → 이전 저장 상태가 있으면 변경 감지
    # 실제로는 되돌리기(Revert) 메뉴를 실행해야 함

    # 방법: Alt 키로 메뉴 접근
    # Alt+J(파일) → 되돌리기 메뉴 찾기
    # HWP 2020+ 에서는 Alt → 파일 메뉴가 열림
    # 하지만 메뉴 키는 HWP 버전마다 다름

    # 대신: SendKeys로 Ctrl+Shift+R (되돌리기 단축키) 시도
    VK_CONTROL = 0x11
    VK_SHIFT = 0x10
    VK_R = 0x52

    # Ctrl+Shift+R 시도
    win32api.keybd_event(VK_CONTROL, 0, 0, 0)
    win32api.keybd_event(VK_SHIFT, 0, 0, 0)
    win32api.keybd_event(VK_R, 0, 0, 0)
    time.sleep(0.05)
    win32api.keybd_event(VK_R, 0, win32con.KEYEVENTF_KEYUP, 0)
    win32api.keybd_event(VK_SHIFT, 0, win32con.KEYEVENTF_KEYUP, 0)
    win32api.keybd_event(VK_CONTROL, 0, win32con.KEYEVENTF_KEYUP, 0)
    time.sleep(0.5)

    # Enter 키 (확인 대화상자가 있을 수 있음)
    VK_RETURN = 0x0D
    win32api.keybd_event(VK_RETURN, 0, 0, 0)
    time.sleep(0.05)
    win32api.keybd_event(VK_RETURN, 0, win32con.KEYEVENTF_KEYUP, 0)

def main():
    pythoncom.CoInitialize()
    doc_path, hwp_hwnd, edit_hwnd = get_info()
    log(f"문서: {doc_path}")
    log(f"HWP hwnd: {hwp_hwnd}, 편집창: {edit_hwnd}")

    if not doc_path:
        log("문서 못 찾음!")
        return

    # 1. COM으로 문서 편집
    log("\n=== COM 편집 ===")
    hwp = win32com.client.Dispatch("HWPFrame.HwpObject")
    try:
        hwp.RegisterModule("FilePathCheckDLL", "FilePathCheckerModuleExample")
    except:
        pass
    hwp.Open(doc_path)

    # 녹색 텍스트 삽입
    hwp.MovePos(2)

    act_cs = hwp.CreateAction("CharShape")
    pset_cs = act_cs.CreateSet()
    act_cs.GetDefault(pset_cs)
    pset_cs.SetItem("TextColor", 0x0000FF00)
    act_cs.Execute(pset_cs)

    act = hwp.CreateAction("InsertText")
    pset = act.CreateSet()
    pset.SetItem("Text", "[AI 녹색 제안] 이 텍스트가 보여야 합니다!\r\n")
    act.Execute(pset)

    act_cs2 = hwp.CreateAction("CharShape")
    pset_cs2 = act_cs2.CreateSet()
    act_cs2.GetDefault(pset_cs2)
    pset_cs2.SetItem("TextColor", 0x00000000)
    act_cs2.Execute(pset_cs2)

    # 저장
    hwp.Save()
    log("  COM 편집 + 저장 완료!")

    # 2. HWP 창에 되돌리기 시그널
    log("\n=== HWP 되돌리기 시도 ===")
    if hwp_hwnd:
        send_keys_to_hwp(hwp_hwnd)
        time.sleep(1)

    log("  HWP에 녹색 텍스트 보이나요? (15초 대기)")
    time.sleep(15)

    # 3. 정리: 원래 상태 복원
    log("\n=== 정리 ===")
    for _ in range(5):
        hwp.HAction.Run("Undo")
    hwp.Save()
    hwp.HAction.Run("FileClose")
    log("  Undo + Save + Close 완료")

    # HWP 창에 다시 되돌리기
    if hwp_hwnd:
        time.sleep(0.5)
        send_keys_to_hwp(hwp_hwnd)

    log("\n=== 테스트 완료 ===")

if __name__ == "__main__":
    main()
