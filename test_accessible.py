# -*- coding: utf-8 -*-
"""
AccessibleObjectFromWindow로 HWP 편집 창에서 COM 객체 가져오기 시도
+ SendMessage WM_GETOBJECT 시도
+ HwpCtrl OLE 시도
"""
import sys
import ctypes
from ctypes import wintypes, POINTER, byref, c_void_p, HRESULT
import struct
import time
import re
import os
import pythoncom
import win32com.client
import win32gui
import win32con
import win32api

sys.stdout.reconfigure(encoding='utf-8')

def log(msg):
    print(f"[TEST] {msg}", flush=True)

# GUID structure for ctypes
class GUID(ctypes.Structure):
    _fields_ = [
        ("Data1", ctypes.c_ulong),
        ("Data2", ctypes.c_ushort),
        ("Data3", ctypes.c_ushort),
        ("Data4", ctypes.c_ubyte * 8)
    ]

def make_guid(guid_string):
    """'{xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx}' → GUID struct"""
    import uuid
    u = uuid.UUID(guid_string)
    g = GUID()
    g.Data1 = u.time_low
    g.Data2 = u.time_mid
    g.Data3 = u.time_hi_version
    for i in range(8):
        g.Data4[i] = u.bytes[8+i]
    return g

# IID_IDispatch = {00020400-0000-0000-C000-000000000046}
IID_IDispatch = make_guid("{00020400-0000-0000-C000-000000000046}")

def find_hwp_windows():
    """HWP 관련 모든 윈도우 찾기"""
    user32 = ctypes.windll.user32
    results = []
    def enum_cb(hwnd, _):
        if not user32.IsWindowVisible(hwnd):
            return True
        length = user32.GetWindowTextLengthW(hwnd)
        buf = ctypes.create_unicode_buffer(max(length + 1, 1))
        user32.GetWindowTextW(hwnd, buf, length + 1)
        class_buf = ctypes.create_unicode_buffer(256)
        user32.GetClassNameW(hwnd, class_buf, 256)
        title = buf.value
        class_name = class_buf.value
        if class_name.startswith("Hwp") or class_name.startswith("HWP") or "한글" in title:
            results.append({"hwnd": hwnd, "class": class_name, "title": title})
        return True
    WNDENUMPROC = ctypes.WINFUNCTYPE(ctypes.c_bool, wintypes.HWND, wintypes.LPARAM)
    user32.EnumWindows(WNDENUMPROC(enum_cb), 0)

    # 자식 윈도우도 찾기
    for r in list(results):
        def enum_child(hwnd, _):
            class_buf = ctypes.create_unicode_buffer(256)
            user32.GetClassNameW(hwnd, class_buf, 256)
            title_len = user32.GetWindowTextLengthW(hwnd)
            title_buf = ctypes.create_unicode_buffer(max(title_len + 1, 1))
            user32.GetWindowTextW(hwnd, title_buf, title_len + 1)
            results.append({
                "hwnd": hwnd,
                "class": class_buf.value,
                "title": title_buf.value,
                "parent": r["hwnd"]
            })
            return True
        WNDENUMPROC2 = ctypes.WINFUNCTYPE(ctypes.c_bool, wintypes.HWND, wintypes.LPARAM)
        user32.EnumChildWindows(r["hwnd"], WNDENUMPROC2(enum_child), 0)

    return results

def test_accessible_object():
    pythoncom.CoInitialize()
    oleacc = ctypes.windll.oleacc

    windows = find_hwp_windows()
    log(f"HWP 관련 윈도우 {len(windows)}개:")
    for w in windows:
        parent = w.get('parent', 'TOP')
        log(f"  hwnd={w['hwnd']}, class='{w['class']}', title='{w['title'][:50]}', parent={parent}")

    # 각 윈도우에서 AccessibleObjectFromWindow 시도
    log("\n=== AccessibleObjectFromWindow 시도 ===")

    OBJID_NATIVEOM = ctypes.c_long(-16)  # 0xFFFFFFF0

    for w in windows:
        hwnd = w['hwnd']
        class_name = w['class']

        # HWP 관련 클래스만 시도
        if not (class_name.startswith('Hwp') or class_name.startswith('HWP')):
            continue

        ptr = c_void_p()
        try:
            hr = oleacc.AccessibleObjectFromWindow(
                hwnd,
                OBJID_NATIVEOM.value & 0xFFFFFFFF,
                byref(IID_IDispatch),
                byref(ptr)
            )
            log(f"  {class_name} (hwnd={hwnd}): hr=0x{hr & 0xFFFFFFFF:08X}, ptr={ptr.value}")
            if hr == 0 and ptr.value:
                # IDispatch 획득!
                try:
                    dispatch = pythoncom.ObjectFromAddress(ptr.value, pythoncom.IID_IDispatch)
                    obj = win32com.client.Dispatch(dispatch)
                    log(f"    >>> IDispatch 획득! type={type(obj)}")
                    for prop in ['Path', 'PageCount', 'Version', 'FileName']:
                        try:
                            val = getattr(obj, prop, 'N/A')
                            log(f"    {prop}: {val}")
                        except:
                            pass
                    try:
                        text = obj.GetTextFile("TEXT", "")
                        log(f"    GetTextFile: {len(text) if text else 0} chars")
                    except:
                        pass
                except Exception as e:
                    log(f"    ObjectFromAddress 실패: {e}")
        except Exception as e:
            log(f"  {class_name} (hwnd={hwnd}): ERROR - {e}")

    # WM_GETOBJECT 시도
    log("\n=== WM_GETOBJECT 시도 ===")
    WM_GETOBJECT = 0x003D
    for w in windows:
        hwnd = w['hwnd']
        class_name = w['class']
        if not class_name.startswith('Hwp'):
            continue
        for lParam in [OBJID_NATIVEOM.value & 0xFFFFFFFF, 0]:
            try:
                result = win32gui.SendMessage(hwnd, WM_GETOBJECT, 0, lParam)
                if result != 0:
                    log(f"  {class_name}: WM_GETOBJECT(lParam=0x{lParam:X}) = {result}")
                    # LresultFromObject → ObjectFromLresult
                    try:
                        ptr = c_void_p()
                        hr = oleacc.ObjectFromLresult(
                            result, byref(IID_IDispatch), 0, byref(ptr)
                        )
                        if hr == 0 and ptr.value:
                            dispatch = pythoncom.ObjectFromAddress(ptr.value, pythoncom.IID_IDispatch)
                            obj = win32com.client.Dispatch(dispatch)
                            log(f"    >>> ObjectFromLresult 성공! type={type(obj)}")
                    except Exception as e:
                        log(f"    ObjectFromLresult: {e}")
            except:
                pass

    # HwpCtrl.HwpObject 시도
    log("\n=== 다른 COM ProgID 시도 ===")
    for progid in ["HWPCtrl.HwpObject", "Hwp.Application", "HWP.Document", "HWPFrame.HwpObject.12"]:
        try:
            obj = win32com.client.Dispatch(progid)
            log(f"  {progid}: 성공!")
            try:
                pages = obj.PageCount
                log(f"    PageCount: {pages}")
            except:
                pass
        except Exception as e:
            log(f"  {progid}: 실패 - {e}")

    log("\n=== 테스트 완료 ===")

if __name__ == "__main__":
    test_accessible_object()
