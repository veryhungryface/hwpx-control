// ──────────────────────────────────────
// Win32HwpAdapter — Python COM 브릿지를 통한 실제 HWP 연동
// ──────────────────────────────────────

import { ChildProcess, spawn } from 'child_process'
import { join } from 'path'
import { app } from 'electron'
import type { IHwpAdapter } from './hwp-adapter'

interface BridgeResponse {
  id: number
  result?: any
  error?: string
}

export class Win32HwpAdapter implements IHwpAdapter {
  private process: ChildProcess | null = null
  private requestId = 0
  private pendingRequests = new Map<number, {
    resolve: (value: any) => void
    reject: (reason: any) => void
  }>()
  private buffer = ''
  private ready = false
  private _connected = false

  // ── 브릿지 프로세스 관리 ──────────────────────────

  async startBridge(): Promise<void> {
    if (this.process) return

    // hwp_bridge.py 경로: 개발 시 프로젝트 루트, 프로덕션 시 resources
    const bridgePath = app.isPackaged
      ? join(process.resourcesPath, 'hwp_bridge.py')
      : join(app.getAppPath(), 'hwp_bridge.py')

    this.process = spawn('python', [bridgePath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
    })

    this.process.stdout?.on('data', (data: Buffer) => {
      this.buffer += data.toString('utf-8')
      const lines = this.buffer.split('\n')
      this.buffer = lines.pop() || ''

      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const msg = JSON.parse(line)

          // 준비 완료 신호
          if (msg.ready) {
            this.ready = true
            continue
          }

          // 응답 처리
          const pending = this.pendingRequests.get(msg.id)
          if (pending) {
            this.pendingRequests.delete(msg.id)
            if (msg.error) {
              pending.reject(new Error(msg.error))
            } else {
              pending.resolve(msg.result)
            }
          }
        } catch (e) {
          console.error('[Win32HwpAdapter] JSON parse error:', line, e)
        }
      }
    })

    this.process.stderr?.on('data', (data: Buffer) => {
      console.error('[Win32HwpAdapter] Python stderr:', data.toString('utf-8'))
    })

    this.process.on('exit', (code) => {
      console.log(`[Win32HwpAdapter] Bridge process exited with code ${code}`)
      this.process = null
      this.ready = false
      this._connected = false
      // 모든 대기 중인 요청 거부
      for (const [, pending] of this.pendingRequests) {
        pending.reject(new Error('Bridge process exited'))
      }
      this.pendingRequests.clear()
    })

    // ready 신호 대기 (최대 10초)
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Bridge startup timeout'))
      }, 10000)

      const check = setInterval(() => {
        if (this.ready) {
          clearInterval(check)
          clearTimeout(timeout)
          resolve()
        }
      }, 50)
    })
  }

  stopBridge(): void {
    if (this.process) {
      this.send('exit', {}).catch(() => {})
      setTimeout(() => {
        this.process?.kill()
        this.process = null
      }, 1000)
    }
  }

  private send(cmd: string, params: Record<string, any> = {}, timeoutMs = 15000): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.process?.stdin) {
        reject(new Error('Bridge not started'))
        return
      }

      const id = ++this.requestId
      this.pendingRequests.set(id, { resolve, reject })

      const request = JSON.stringify({ id, cmd, params }) + '\n'
      this.process.stdin.write(request, 'utf-8')

      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id)
          reject(new Error(`Bridge command timeout: ${cmd}`))
        }
      }, timeoutMs)
    })
  }

  // ── IHwpAdapter 구현 ──────────────────────────────

  findHwpWindow(): { hwnd: number; pid: number; title: string } | null {
    // 동기 호출이 필요하므로 캐시 사용
    // 실제 감지는 connect() 시 수행
    return this._cachedWindow
  }

  private _cachedWindow: { hwnd: number; pid: number; title: string } | null = null

  async findHwpWindowAsync(): Promise<{ hwnd: number; pid: number; title: string } | null> {
    if (!this.ready) {
      try {
        console.log('[Win32HwpAdapter] Bridge not ready, starting...')
        await this.startBridge()
      } catch (e) {
        console.error('[Win32HwpAdapter] Failed to start bridge:', e)
        return null
      }
    }
    const result = await this.send('findHwpWindow')
    console.log('[Win32HwpAdapter] findHwpWindow result:', JSON.stringify(result))
    this._cachedWindow = result
    return result
  }

  connect(): boolean {
    // 동기 인터페이스이므로 connectAsync() 결과를 캐시로 반환
    return this._connected
  }

  async connectAsync(): Promise<boolean> {
    try {
      if (!this.ready) {
        await this.startBridge()
      }

      const result = await this.send('connect')
      console.log('[Win32HwpAdapter] connect result:', JSON.stringify(result))
      this._connected = result?.success === true
      return this._connected
    } catch (e) {
      console.error('[Win32HwpAdapter] connect failed:', e)
      this._connected = false
      return false
    }
  }

  disconnect(): void {
    this._connected = false
    this.send('disconnect').catch(() => {})
  }

  isConnected(): boolean {
    return this._connected
  }

  getFullText(): string {
    // 동기 인터페이스 — getFullTextAsync() 사용 권장
    return this._cachedText || ''
  }

  private _cachedText: string = ''

  async getFullTextAsync(): Promise<string> {
    const result = await this.send('getFullText')
    this._cachedText = result?.text || ''
    return this._cachedText
  }

  async getNumberedTextAsync(): Promise<{
    numberedText: string
    paragraphMap: Record<number, string>
    totalParagraphs: number
  }> {
    const result = await this.send('getNumberedText')
    return {
      numberedText: result?.numberedText || '',
      paragraphMap: result?.paragraphMap || {},
      totalParagraphs: result?.totalParagraphs || 0
    }
  }

  getCursorPos(): { page: number; paragraph: number; charIndex: number } {
    return this._cachedCursorPos || { page: 1, paragraph: 1, charIndex: 0 }
  }

  private _cachedCursorPos: { page: number; paragraph: number; charIndex: number } | null = null

  async getCursorPosAsync(): Promise<{ page: number; paragraph: number; charIndex: number }> {
    const result = await this.send('getCursorPos')
    if (result?.error) throw new Error(result.error)
    this._cachedCursorPos = {
      page: result.page || 1,
      paragraph: result.paragraph || 1,
      charIndex: result.charIndex || 0
    }
    return this._cachedCursorPos
  }

  getTotalPages(): number {
    return this._cachedTotalPages || 1
  }

  private _cachedTotalPages: number = 1

  async getTotalPagesAsync(): Promise<number> {
    const result = await this.send('getTotalPages')
    this._cachedTotalPages = result?.pages || 1
    return this._cachedTotalPages
  }

  getTextRange(startPage: number, endPage: number): string {
    return this._cachedText || ''
  }

  async getTextRangeAsync(startPage: number, endPage: number): Promise<string> {
    const result = await this.send('getTextRange', { startPage, endPage })
    return result?.text || ''
  }

  getSelectedText(): string | null {
    return null
  }

  async getSelectedTextAsync(): Promise<string | null> {
    const result = await this.send('getSelectedText')
    return result?.text || null
  }

  getParagraphText(paragraphIndex: number): string {
    return ''
  }

  async getParagraphTextAsync(paragraphIndex: number): Promise<string> {
    const result = await this.send('getParagraphText', { paragraphIndex })
    return result?.text || ''
  }

  // ── 편집 (비동기) ─────────────────────────────────

  insertAfterParagraph(paragraphIndex: number, text: string): void {
    this.send('insertAfterParagraph', { paragraphIndex, text }).catch(e =>
      console.error('[Win32HwpAdapter] insertAfterParagraph failed:', e)
    )
  }

  async insertAfterParagraphAsync(paragraphIndex: number, text: string): Promise<void> {
    const result = await this.send('insertAfterParagraph', { paragraphIndex, text })
    if (result?.error) throw new Error(result.error)
  }

  findAndReplace(paragraphIndex: number, search: string, replacement: string): void {
    this.send('findAndReplace', { paragraphIndex, search, replacement }).catch(e =>
      console.error('[Win32HwpAdapter] findAndReplace failed:', e)
    )
  }

  async findAndReplaceAsync(paragraphIndex: number, search: string, replacement: string): Promise<void> {
    const result = await this.send('findAndReplace', { paragraphIndex, search, replacement })
    if (result?.error) throw new Error(result.error)
  }

  deleteParagraph(paragraphIndex: number): void {
    this.send('deleteParagraph', { paragraphIndex }).catch(e =>
      console.error('[Win32HwpAdapter] deleteParagraph failed:', e)
    )
  }

  async deleteParagraphAsync(paragraphIndex: number): Promise<void> {
    const result = await this.send('deleteParagraph', { paragraphIndex })
    if (result?.error) throw new Error(result.error)
  }

  // ── hwpx 직접 편집 ────────────────────────────────

  async editHwpxAsync(edits: Array<{ action: string; paragraph: number; search?: string; text?: string }>): Promise<{ applied: number; failed: number; errors: string[] }> {
    const result = await this.send('editHwpx', { edits })
    if (result?.error) throw new Error(result.error)
    return { applied: result?.applied ?? 0, failed: result?.failed ?? 0, errors: result?.errors ?? [] }
  }

  async revertHwpxAsync(): Promise<void> {
    const result = await this.send('revertHwpx')
    if (result?.error) throw new Error(result.error)
  }

  // ── 인라인 편집 (녹색 텍스트) ─────────────────────

  async applyInlineEditsAsync(edits: Array<{ action: string; paragraph: number; search?: string; text?: string }>): Promise<{ applied: number; failed: number; errors: string[] }> {
    // COM AllReplace + FileSave — 빠르지만 FileSave에 시간 필요
    const timeoutMs = Math.max(15000, edits.length * 2000)
    const result = await this.send('applyInlineEdits', { edits }, timeoutMs)
    if (result?.error) throw new Error(result.error)
    return { applied: result?.applied ?? 0, failed: result?.failed ?? 0, errors: result?.errors ?? [] }
  }

  async acceptInlineEditsAsync(): Promise<void> {
    const result = await this.send('acceptInlineEdits')
    if (result?.error) throw new Error(result.error)
  }

  async rejectInlineEditsAsync(): Promise<void> {
    const result = await this.send('rejectInlineEdits', {}, 30000)
    if (result?.error) throw new Error(result.error)
  }

  // ── 창 관리 ────────────────────────────────────────

  arrangeWindows(electronHwnd: number, ratio: number, swap: boolean): void {
    this.send('arrangeWindows', { electronHwnd, ratio, swap }).catch(e =>
      console.error('[Win32HwpAdapter] arrangeWindows failed:', e)
    )
  }

  async arrangeWindowsAsync(electronHwnd: number, ratio: number, swap: boolean): Promise<void> {
    const result = await this.send('arrangeWindows', { electronHwnd, ratio, swap })
    if (result?.error) throw new Error(result.error)
  }
}
