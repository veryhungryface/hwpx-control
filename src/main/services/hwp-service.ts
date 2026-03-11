import { IHwpAdapter } from './hwp-adapter'
import type { Win32HwpAdapter } from './win32-hwp-adapter'
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
  private isPolling = false

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

  /** Win32 어댑터인지 확인 */
  private isWin32Adapter(): this is { adapter: Win32HwpAdapter } {
    return 'connectAsync' in this.adapter
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

    const poll = async () => {
      // 이전 폴링이 아직 진행 중이면 건너뜀
      if (this.isPolling) return
      this.isPolling = true

      try {
        if (this.isWin32Adapter()) {
          await this.pollWin32()
        } else {
          this.pollSync()
        }
      } catch (e) {
        console.error('[HwpService] poll error:', e)
      } finally {
        this.isPolling = false
      }
    }

    // 즉시 첫 번째 폴링 실행
    poll()
    this.pollTimer = setInterval(poll, intervalMs)
  }

  /** Mock 어댑터용 동기 폴링 */
  private pollSync(): void {
    const window = this.adapter.findHwpWindow()
    if (window !== null) {
      if (!this.adapter.isConnected()) {
        this.adapter.connect()
      }
      const cursorPos = this.adapter.getCursorPos()
      const totalPages = this.adapter.getTotalPages()
      this.updateStatus({
        connected: true,
        hwpVersion: '한글',
        docName: window.title,
        cursorPage: cursorPos.page,
        totalPages,
      })
    } else {
      if (this.adapter.isConnected()) {
        this.adapter.disconnect()
      }
      this.updateStatus({
        connected: false,
        hwpVersion: null,
        docName: null,
        cursorPage: null,
        totalPages: null,
      })
    }
  }

  /** Win32 어댑터용 비동기 폴링 */
  private async pollWin32(): Promise<void> {
    const adapter = this.adapter as Win32HwpAdapter
    try {
      const window = await adapter.findHwpWindowAsync()
      if (window !== null) {
        if (!adapter.isConnected()) {
          console.log('[HwpService] HWP window found, connecting...')
          await adapter.connectAsync()
        }
        if (adapter.isConnected()) {
          const cursorPos = await adapter.getCursorPosAsync()
          const totalPages = await adapter.getTotalPagesAsync()
          this.updateStatus({
            connected: true,
            hwpVersion: '한글',
            docName: window.title,
            cursorPage: cursorPos.page,
            totalPages,
          })
        } else {
          console.log('[HwpService] connectAsync returned false')
          this.updateStatus({
            connected: false,
            hwpVersion: null,
            docName: null,
            cursorPage: null,
            totalPages: null,
          })
        }
      } else {
        if (adapter.isConnected()) {
          adapter.disconnect()
        }
        this.updateStatus({
          connected: false,
          hwpVersion: null,
          docName: null,
          cursorPage: null,
          totalPages: null,
        })
      }
    } catch (e) {
      console.error('[HwpService] pollWin32 error:', e)
      this.updateStatus({
        connected: false,
        hwpVersion: null,
        docName: null,
        cursorPage: null,
        totalPages: null,
      })
    }
  }

  private updateStatus(nextStatus: HwpStatus): void {
    const changed = !this.statusEqual(this.status, nextStatus)
    this.status = nextStatus
    if (changed) {
      this.onStatusChange?.(this.getStatus())
    }
  }

  stopPolling(): void {
    if (this.pollTimer !== null) {
      clearInterval(this.pollTimer)
      this.pollTimer = null
    }
    this.onStatusChange = undefined
  }

  // ── 문서 컨텍스트 읽기 ───────────────────────────────────

  async readDocumentContext(pageRange?: [number, number]): Promise<DocumentContext> {
    let totalPages: number
    let rawText: string
    let startPage: number
    let endPage: number

    if (this.isWin32Adapter()) {
      const adapter = this.adapter as Win32HwpAdapter
      totalPages = await adapter.getTotalPagesAsync()

      if (pageRange) {
        startPage = Math.max(1, pageRange[0])
        endPage = Math.min(totalPages, pageRange[1])
      } else {
        const cursorPos = await adapter.getCursorPosAsync()
        startPage = Math.max(1, cursorPos.page - DEFAULTS.CONTEXT_PAGE_RANGE)
        endPage = Math.min(totalPages, cursorPos.page + DEFAULTS.CONTEXT_PAGE_RANGE)
      }

      rawText = await adapter.getTextRangeAsync(startPage, endPage)
    } else {
      totalPages = this.adapter.getTotalPages()

      if (pageRange) {
        startPage = Math.max(1, pageRange[0])
        endPage = Math.min(totalPages, pageRange[1])
      } else {
        const cursorPos = this.adapter.getCursorPos()
        startPage = Math.max(1, cursorPos.page - DEFAULTS.CONTEXT_PAGE_RANGE)
        endPage = Math.min(totalPages, cursorPos.page + DEFAULTS.CONTEXT_PAGE_RANGE)
      }

      rawText = this.adapter.getTextRange(startPage, endPage)
    }

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

  async applyEdits(edits: EditCommand[]): Promise<ApplyEditsResult> {
    const result: ApplyEditsResult = {
      applied: 0,
      failed: 0,
      errors: [],
    }

    if (edits.length === 0) {
      return result
    }

    // Win32: COM 인라인 편집 (녹색 텍스트)
    if (this.isWin32Adapter()) {
      const adapter = this.adapter as Win32HwpAdapter
      try {
        const inlineResult = await adapter.applyInlineEditsAsync(edits)
        return {
          applied: inlineResult.applied,
          failed: inlineResult.failed,
          errors: inlineResult.errors,
        }
      } catch (err) {
        return {
          applied: 0,
          failed: edits.length,
          errors: [err instanceof Error ? err.message : String(err)],
        }
      }
    }

    // Mock: 기존 동기 방식
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
            if (edit.search === undefined || edit.text === undefined) {
              throw new Error(`replace 명령에 search/text가 없습니다 (paragraph=${edit.paragraph})`)
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

  /** 인라인 편집 수락 (녹색 → 검정) */
  async acceptInlineEdits(): Promise<void> {
    if (this.isWin32Adapter()) {
      const adapter = this.adapter as Win32HwpAdapter
      await adapter.acceptInlineEditsAsync()
    }
  }

  /** 인라인 편집 거절 (Undo) */
  async rejectInlineEdits(): Promise<void> {
    if (this.isWin32Adapter()) {
      const adapter = this.adapter as Win32HwpAdapter
      await adapter.rejectInlineEditsAsync()
    }
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
