# -*- coding: utf-8 -*-
"""
HWP COM PoC - 5개 항목 모두 통과해야 프로젝트 진행 가능
"""
import win32com.client
import sys
import io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

def test():
    results = []

    # 1. COM 객체 생성
    try:
        hwp = win32com.client.gencache.EnsureDispatch("HWPFrame.HwpObject")
        hwp.XHwpWindows.Item(0).Visible = True
        results.append(("COM 객체 생성", True))
        print("[PASS] 1/5 COM 객체 생성 성공")
    except Exception as e:
        results.append(("COM 객체 생성", False))
        print(f"[FAIL] 1/5 COM 객체 생성 실패: {e}")
        print("\n!! COM 연결 실패. 한/글이 실행 중인지, 버전이 맞는지 확인하세요.")
        sys.exit(1)

    # 2. 텍스트 읽기
    try:
        text = hwp.GetTextFile("TEXT", "")
        assert len(text) > 0, "텍스트가 비어있음"
        results.append(("텍스트 읽기", True))
        print(f"[PASS] 2/5 텍스트 읽기 성공 (길이: {len(text)}자)")
        print(f"   처음 200자: {text[:200]}")
    except Exception as e:
        results.append(("텍스트 읽기", False))
        print(f"[FAIL] 2/5 텍스트 읽기 실패: {e}")

    # 3. 커서 위치 조회
    try:
        pos = hwp.GetPos()
        results.append(("커서 위치 조회", True))
        print(f"[PASS] 3/5 커서 위치 조회 성공: List={pos[0]}, Para={pos[1]}, Char={pos[2]}")
    except Exception as e:
        results.append(("커서 위치 조회", False))
        print(f"[FAIL] 3/5 커서 위치 조회 실패: {e}")

    # 4. 커서 이동 (문서 끝으로)
    try:
        hwp.MovePos(3)  # 3 = 문서 끝
        pos2 = hwp.GetPos()
        results.append(("커서 이동", True))
        print(f"[PASS] 4/5 커서 이동 성공: 문서 끝 위치 = List={pos2[0]}, Para={pos2[1]}")
    except Exception as e:
        results.append(("커서 이동", False))
        print(f"[FAIL] 4/5 커서 이동 실패: {e}")

    # 5. 텍스트 삽입
    try:
        test_text = "\n[AI 테스트] COM 자동화 텍스트 삽입 성공!"
        act = hwp.CreateAction("InsertText")
        pset = act.CreateSet()
        pset.SetItem("Text", test_text)
        act.Execute(pset)
        results.append(("텍스트 삽입", True))
        print("[PASS] 5/5 텍스트 삽입 성공 -- HWP 문서를 확인하세요!")
    except Exception as e:
        results.append(("텍스트 삽입", False))
        print(f"[FAIL] 5/5 텍스트 삽입 실패 (방식 1): {e}")
        # 대안 방식 시도
        try:
            hwp.HAction.GetDefault("InsertText", hwp.HParameterSet.HInsertText.HSet)
            hwp.HParameterSet.HInsertText.Text = test_text
            hwp.HAction.Execute("InsertText", hwp.HParameterSet.HInsertText.HSet)
            results[-1] = ("텍스트 삽입 (대안)", True)
            print("[PASS] 5/5 텍스트 삽입 성공 (대안 방식) -- HWP 문서를 확인하세요!")
        except Exception as e2:
            print(f"[FAIL] 5/5 대안 방식도 실패: {e2}")

    # 결과 요약
    print("\n" + "=" * 50)
    passed = sum(1 for _, ok in results if ok)
    print(f"결과: {passed}/5 통과")
    if passed == 5:
        print("COM PoC 검증 완료! Phase 1으로 진행 가능.")
    else:
        failed = [name for name, ok in results if not ok]
        print(f"실패 항목: {', '.join(failed)}")
        print("클립보드 폴백 또는 프로젝트 범위 축소를 검토하세요.")

if __name__ == "__main__":
    test()
