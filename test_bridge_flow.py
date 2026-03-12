# -*- coding: utf-8 -*-
"""hwp_bridge.py의 실제 메서드를 직접 호출하여 Track Changes 플로우 테스트"""
import sys, time
sys.stdout.reconfigure(encoding='utf-8')
sys.path.insert(0, '.')

from hwp_bridge import HwpBridge

def log(msg):
    print(f"[FLOW] {msg}", flush=True)

def main():
    bridge = HwpBridge()

    # 1. 연결
    log("=== 연결 ===")
    result = bridge.connect()
    log(f"connect: {result}")
    if not result.get('success'):
        log("연결 실패!")
        return

    # 2. 문서 텍스트 확인
    text_result = bridge.get_full_text()
    full_text = text_result.get('text', '')
    log(f"문서: {len(full_text)} chars")

    # 3. 고유한 텍스트 찾기 (AllReplace 테스트용)
    paras = full_text.split('\r\n')
    target = None
    for p in paras:
        s = p.strip()
        if len(s) > 20 and '•' not in s and '【' not in s:
            # 고유한 부분 선택
            target = s[5:15] if len(s) > 15 else s[:10]
            log(f"타겟: '{target}' (from: '{s[:40]}')")
            break

    if not target:
        log("타겟 텍스트 없음")
        return

    # 4. 미리보기 (apply_inline_edits)
    log("\n=== 미리보기 ===")
    edits = [{
        'action': 'replace',
        'paragraph': 1,
        'search': target,
        'text': 'AI수정완료'
    }]
    preview_result = bridge.apply_inline_edits(edits)
    log(f"preview: {preview_result}")

    # 결과 확인
    time.sleep(1)
    text2 = bridge.get_full_text().get('text', '')
    has_marker = '【삭제:' in text2 or '【추:' in text2
    log(f"마커 존재: {has_marker}")
    if has_marker:
        idx = text2.find('【삭')
        log(f"마커 위치: ...{text2[max(0,idx-10):idx+50]}...")
    else:
        log("마커 없음 — 미리보기 실패!")
        # 원본 텍스트 상태 확인
        if target in text2:
            log(f"원본 '{target}' 존재 (변경 없음)")
        else:
            log(f"원본 '{target}' 없음")
        return

    log("HWP에서 마커 확인. 10초 대기...")
    time.sleep(10)

    # 5. 거절 (reject_inline_edits)
    log("\n=== 거절 ===")
    reject_result = bridge.reject_inline_edits()
    log(f"reject: {reject_result}")

    time.sleep(1)
    text3 = bridge.get_full_text().get('text', '')
    has_marker3 = '【삭' in text3
    has_target3 = target in text3
    log(f"거절 후 — 마커: {has_marker3}, 원본: {has_target3}")

    if has_target3 and not has_marker3:
        log("✓ 거절 성공!")
    else:
        log("✗ 거절 실패")

    log("5초 대기...")
    time.sleep(5)

    # 6. 다시 미리보기 → 수락
    log("\n=== 다시 미리보기 → 수락 ===")
    preview2 = bridge.apply_inline_edits(edits)
    log(f"preview2: {preview2}")
    time.sleep(1)

    accept_result = bridge.accept_inline_edits()
    log(f"accept: {accept_result}")

    time.sleep(1)
    text4 = bridge.get_full_text().get('text', '')
    has_new = 'AI수정완료' in text4
    has_old = target in text4
    has_marker4 = '【삭' in text4
    log(f"수락 후 — 수정텍스트: {has_new}, 원본: {has_old}, 마커: {has_marker4}")

    if has_new and not has_old and not has_marker4:
        log("✓ 수락 성공!")
    else:
        log("△ 부분 성공 또는 실패")

    log("5초 대기...")
    time.sleep(5)

    # 7. 최종 복원
    log("\n=== 최종 복원 ===")
    # AllReplace로 원본 복원
    bridge._com_all_replace('AI수정완료', target)
    bridge._com_save_and_refresh()
    time.sleep(1)
    text5 = bridge.get_full_text().get('text', '')
    log(f"복원: {target in text5}")

    log("\n=== 종료 ===")

if __name__ == "__main__":
    main()
