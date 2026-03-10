import { IHwpAdapter } from './hwp-adapter'
import {
  ApplyEditsResult,
  DocumentContext,
  EditCommand,
  HwpStatus,
  NumberedParagraph,
} from '../../shared/types'
import { DEFAULTS } from '../../shared/constants'

// 단락당 약 8개 문단이 한 페이지에 해당하는 상수 (어댑터와 동일하게 유지)
const PARAGRAPHS_PER_PAGE = 8

export class HwpService {
  private adapter: IHwpAdapter
  private pollTimer: NodeJS.Timeout | null = null
  private status: HwpStatus
  private onStatusChange?: (status: HwpStatus) => void

  constructor(adapter: IHwpAdapter) {
    this.adapter = adapter
    this.status = {
      connected: false,
      hwpVersion: null,
      docName: null,
      cursorPage: null,
      totalPages: null,
    }
  }

  // ── 상태 조회 ─────────────────────────────────────────────

  getStatus(): HwpStatus {
    return { ...this.status }
  }

  // ── HWP 감지 폴링 ─────────────────────────────────────────

  startPolling(intervalMs: number, onStatusChange: (status: HwpStatus) => void): void {
    if (this.pollTimer !== null) {
      // 이미 폴링 중이면 콜백만 교체
      this.onStatusChange = onStatusChange
      return
    }
    this.onStatusChange = onStatusChange

    const poll = () => {
      const window = this.adapter.findHwpWindow()
      if (window !== null) {
        if (!this.adapter.isConnected()) {
          this.adapter.connect()
        }
        const cursorPos = this.adapter.getCursorPos()
        const totalPages = this.adapter.getTotalPages()
        const nextStatus: HwpStatus = {
          connected: true,
          hwpVersion: '한글 2022',
          docName: window.title,
          cursorPage: cursorPos.page,
          totalPages,
        }
        const changed = !this.statusEqual(this.status, nextStatus)
        this.status = nextStatus
        if (changed) {
          this.onStatusChange?.(this.getStatus())
        }
      } else {
        if (this.adapter.isConnected()) {
          this.adapter.disconnect()
        }
        const nextStatus: HwpStatus = {
          connected: false,
          hwpVersion: null,
          docName: null,
          cursorPage: null,
          totalPages: null,
        }
        const changed = !this.statusEqual(this.status, nextStatus)
        this.status = nextStatus
        if (changed) {
          this.onStatusChange?.(this.getStatus())
        }
      }
    }

    // 즉시 첫 번째 폴링 실행
    poll()
    this.pollTimer = setInterval(poll, intervalMs)
  }

  stopPolling(): void {
    if (this.pollTimer !== null) {
      clearInterval(this.pollTimer)
      this.pollTimer = null
    }
    this.onStatusChange = undefined
  }

  // ── 문서 컨텍스트 읽기 ───────────────────────────────────

  readDocumentContext(pageRange?: [number, number]): DocumentContext {
    const totalPages = this.adapter.getTotalPages()

    let startPage: number
    let endPage: number

    if (pageRange) {
      startPage = Math.max(1, pageRange[0])
      endPage = Math.min(totalPages, pageRange[1])
    } else {
      const cursorPos = this.adapter.getCursorPos()
      const currentPage = cursorPos.page
      startPage = Math.max(1, currentPage - DEFAULTS.CONTEXT_PAGE_RANGE)
      endPage = Math.min(totalPages, currentPage + DEFAULTS.CONTEXT_PAGE_RANGE)
    }

    const rawText = this.adapter.getTextRange(startPage, endPage)
    const paragraphs = this.parseParagraphs(rawText, startPage)

    return {
      pageRange: [startPage, endPage],
      paragraphs,
      totalParagraphs: paragraphs.length,
    }
  }

  // ── 내부: 원시 텍스트 → NumberedParagraph[] ──────────────

  private parseParagraphs(rawText: string, startPage: number): NumberedParagraph[] {
    // 빈 줄 포함 \n으로 분리하되 완전히 빈 문자열은 제외
    const lines = rawText.split('\n').filter((line) => line.trim().length > 0)

    // startPage에 해당하는 첫 번째 문단의 전역 1-based 인덱스를 계산
    // (startPage - 1) * PARAGRAPHS_PER_PAGE + 1
    const globalStartIndex = (startPage - 1) * PARAGRAPHS_PER_PAGE + 1

    return lines.map((text, i) => {
      const globalIndex = globalStartIndex + i
      // 전역 인덱스를 기반으로 페이지를 추정 (1-based)
      const estimatedPage = Math.ceil(globalIndex / PARAGRAPHS_PER_PAGE)
      return {
        index: globalIndex,
        text,
        page: estimatedPage,
      }
    })
  }

  // ── 편집 적용 ─────────────────────────────────────────────

  applyEdits(edits: EditCommand[]): ApplyEditsResult {
    const result: ApplyEditsResult = {
      applied: 0,
      failed: 0,
      errors: [],
    }

    if (edits.length === 0) {
      return result
    }

    // CRITICAL: 문단 번호 내림차순(뒤→앞) 정렬하여 인덱스 이동 방지
    const sorted = [...edits].sort((a, b) => b.paragraph - a.paragraph)

    for (const edit of sorted) {
      try {
        switch (edit.action) {
          case 'insert': {
            if (edit.text === undefined) {
              throw new Error(`insert 명령에 text가 없습니다 (paragraph=${edit.paragraph})`)
            }
            this.adapter.insertAfterParagraph(edit.paragraph, edit.text)
            result.applied++
            break
          }
          case 'replace': {
            if (edit.search === undefined) {
              throw new Error(`replace 명령에 search가 없습니다 (paragraph=${edit.paragraph})`)
            }
            if (edit.text === undefined) {
              throw new Error(`replace 명령에 text가 없습니다 (paragraph=${edit.paragraph})`)
            }
            this.adapter.findAndReplace(edit.paragraph, edit.search, edit.text)
            result.applied++
            break
          }
          case 'delete': {
            this.adapter.deleteParagraph(edit.paragraph)
            result.applied++
            break
          }
          default: {
            // TypeScript exhaustiveness guard
            const _exhaustive: never = edit.action
            throw new Error(`알 수 없는 편집 액션: ${_exhaustive}`)
          }
        }
      } catch (err) {
        result.failed++
        result.errors.push(err instanceof Error ? err.message : String(err))
      }
    }

    return result
  }

  // ── 선택 텍스트 조회 ─────────────────────────────────────

  getSelection(): { text: string } | null {
    const text = this.adapter.getSelectedText()
    if (text === null || text.trim().length === 0) {
      return null
    }
    return { text }
  }

  // ── 창 배치 ───────────────────────────────────────────────

  arrangeWindows(electronHwnd: number, ratio: number, swap: boolean): void {
    this.adapter.arrangeWindows(electronHwnd, ratio, swap)
  }

  // ── 내부 유틸리티 ─────────────────────────────────────────

  private statusEqual(a: HwpStatus, b: HwpStatus): boolean {
    return (
      a.connected === b.connected &&
      a.hwpVersion === b.hwpVersion &&
      a.docName === b.docName &&
      a.cursorPage === b.cursorPage &&
      a.totalPages === b.totalPages
    )
  }
}
