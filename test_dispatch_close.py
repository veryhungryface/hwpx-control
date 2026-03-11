# -*- coding: utf-8 -*-
"""
Dispatch로 생성된 빈 문서를 닫고 나면
COM이 원래 열린 문서에 연결되는지 테스트
"""
import sys
import time
import pythoncom
import win32com.client

sys.stdout.reconfigure(encoding='utf-8')

def log(msg):
    print(f"[TEST] {msg}", flush=True)

def main():
    pythoncom.CoInitialize()

    log("=== Dispatch ===")
    hwp = win32com.client.Dispatch("HWPFrame.HwpObject")
    try:
        hwp.RegisterModule("FilePathCheckDLL", "FilePathCheckerModuleExample")
    except:
        pass

    log(f"  PageCount: {hwp.PageCount}")
    log(f"  Path: {hwp.Path}")
    log(f"  XHwpDocuments.Count: {hwp.XHwpDocuments.Count}")

    # 현재 열린 문서 목록
    for i in range(hwp.XHwpDocuments.Count):
        try:
            doc = hwp.XHwpDocuments.Item(i)
            log(f"  Doc[{i}]: {doc}")
        except Exception as e:
            log(f"  Doc[{i}]: {e}")

    # 빈 문서 닫기
    log("\n=== 빈 문서 닫기 시도 ===")

    # 방법 1: FileClose
    try:
        result = hwp.HAction.Run("FileClose")
        log(f"  FileClose: {result}")
    except Exception as e:
        log(f"  FileClose 실패: {e}")

    time.sleep(1)

    # 닫은 후 상태
    try:
        log(f"\n  닫은 후 PageCount: {hwp.PageCount}")
        log(f"  닫은 후 Path: {hwp.Path}")
        log(f"  닫은 후 XHwpDocuments.Count: {hwp.XHwpDocuments.Count}")

        text = hwp.GetTextFile("TEXT", "")
        log(f"  닫은 후 GetTextFile: {len(text) if text else 0} chars")
        if text and len(text) > 0:
            log(f"  preview: {text[:200]!r}")

            # 문서 시작에 녹색 텍스트 삽입
            log(f"\n=== 녹색 텍스트 삽입 ===")
            hwp.MovePos(2)

            act_cs = hwp.CreateAction("CharShape")
            pset_cs = act_cs.CreateSet()
            act_cs.GetDefault(pset_cs)
            pset_cs.SetItem("TextColor", 0x0000FF00)
            act_cs.Execute(pset_cs)

            act = hwp.CreateAction("InsertText")
            pset = act.CreateSet()
            pset.SetItem("Text", "★★★ DISPATCH+CLOSE 테스트 ★★★\r\n")
            act.Execute(pset)

            act_cs2 = hwp.CreateAction("CharShape")
            pset_cs2 = act_cs2.CreateSet()
            act_cs2.GetDefault(pset_cs2)
            pset_cs2.SetItem("TextColor", 0x00000000)
            act_cs2.Execute(pset_cs2)

            log(f"  삽입 완료! HWP에서 확인하세요 (10초)")
            time.sleep(10)

            for _ in range(5):
                hwp.HAction.Run("Undo")
            log(f"  Undo 완료")
        else:
            log(f"  텍스트 없음 → 원래 문서에 연결 안 됨")
    except Exception as e:
        log(f"  닫은 후 확인 실패: {e}")
        import traceback
        traceback.print_exc()

    # 방법 2: XHwpDocuments 사용
    log("\n=== XHwpDocuments로 문서 접근 시도 ===")
    try:
        count = hwp.XHwpDocuments.Count
        log(f"  Count: {count}")
        for i in range(count):
            doc = hwp.XHwpDocuments.Item(i)
            log(f"  Doc[{i}]: {doc}")
    except Exception as e:
        log(f"  XHwpDocuments 실패: {e}")

    log("\n=== 테스트 완료 ===")

if __name__ == "__main__":
    main()
