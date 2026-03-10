// ──────────────────────────────────────
// IHwpAdapter — Win32/COM 어댑터 인터페이스
// ──────────────────────────────────────

export interface IHwpAdapter {
  // HWP 프로세스 감지
  findHwpWindow(): { hwnd: number; pid: number; title: string } | null

  // COM 연결
  connect(): boolean
  disconnect(): void
  isConnected(): boolean

  // 문서 읽기
  getFullText(): string
  getCursorPos(): { page: number; paragraph: number; charIndex: number }
  getTotalPages(): number
  getTextRange(startPage: number, endPage: number): string
  getSelectedText(): string | null
  getParagraphText(paragraphIndex: number): string

  // 문서 편집
  insertAfterParagraph(paragraphIndex: number, text: string): void
  findAndReplace(paragraphIndex: number, search: string, replacement: string): void
  deleteParagraph(paragraphIndex: number): void

  // 창 관리
  arrangeWindows(electronHwnd: number, ratio: number, swap: boolean): void
}

// ──────────────────────────────────────
// MockHwpAdapter — macOS 개발용 Mock
// ──────────────────────────────────────

// 샘플 개인정보처리방침 문서 (20개 이상의 문단)
const SAMPLE_PARAGRAPHS: string[] = [
  '개인정보처리방침',
  '주식회사 한국소프트웨어(이하 "회사")는 이용자의 개인정보를 중요하게 생각하며, 개인정보보호법, 정보통신망 이용촉진 및 정보보호 등에 관한 법률 등 관련 법령을 준수하고 있습니다.',
  '회사는 본 개인정보처리방침을 통해 이용자가 제공하는 개인정보가 어떠한 목적과 방식으로 이용되고 있으며, 개인정보 보호를 위해 어떠한 조치가 취해지고 있는지 알려드립니다.',
  '제1조 (수집하는 개인정보의 항목 및 수집 방법)',
  '회사는 서비스 제공을 위해 필요한 최소한의 개인정보를 수집합니다. 수집하는 개인정보의 항목은 다음과 같습니다.',
  '필수 수집 항목: 성명, 생년월일, 성별, 이메일 주소, 휴대전화 번호, 아이디, 비밀번호',
  '선택 수집 항목: 주소, 직업, 관심 분야, 마케팅 수신 동의 여부',
  '회사는 다음과 같은 방법으로 개인정보를 수집합니다. 홈페이지, 서면 양식, 팩스, 전화, 상담 게시판, 이메일, 이벤트 응모, 배송 요청, 협력사로부터의 제공, 생성 정보 수집 툴을 통한 수집 등.',
  '제2조 (개인정보의 수집 및 이용 목적)',
  '회사는 수집한 개인정보를 다음의 목적을 위해 이용합니다.',
  '서비스 제공 및 계약 이행: 콘텐츠 제공, 특정 맞춤 서비스 제공, 물품 배송 또는 청구서 등 발송, 본인인증, 구매 및 요금 결제, 요금 추심.',
  '회원 관리: 회원제 서비스 이용에 따른 본인 확인, 개인 식별, 불량회원의 부정 이용 방지와 비인가 사용 방지, 가입 의사 확인, 불만 처리 등 민원 처리, 고지사항 전달.',
  '마케팅 및 광고에 활용: 신규 서비스 개발 및 특화, 이벤트 등 광고성 정보 전달, 접속 빈도 파악 또는 회원의 서비스 이용에 대한 통계.',
  '제3조 (개인정보의 보유 및 이용 기간)',
  '이용자의 개인정보는 원칙적으로 개인정보의 수집 및 이용 목적이 달성되면 지체 없이 파기합니다. 단, 다음의 정보에 대해서는 아래의 이유로 명시한 기간 동안 보존합니다.',
  '회원정보: 회원 탈퇴 시까지. 단, 다음의 사유에 해당하는 경우에는 해당 사유 종료 시까지.',
  '관계 법령 위반에 따른 수사·조사 등이 진행 중인 경우에는 해당 수사·조사 종료 시까지.',
  '서비스 이용에 따른 채권·채무 관계 잔존 시에는 해당 채권·채무 관계 정산 시까지.',
  '전자상거래 등에서의 소비자 보호에 관한 법률: 계약 또는 청약 철회 등에 관한 기록 5년, 대금결제 및 재화 등의 공급에 관한 기록 5년, 소비자의 불만 또는 분쟁 처리에 관한 기록 3년.',
  '통신비밀보호법: 통신사실확인자료 제공 시 필요한 로그 기록 자료 3개월.',
  '제4조 (개인정보의 파기 절차 및 방법)',
  '이용자의 개인정보는 수집 및 이용 목적이 달성된 후 지체 없이 파기합니다. 파기 절차 및 방법은 다음과 같습니다.',
  '파기 절차: 이용자가 회원가입 등을 위해 입력한 정보는 목적이 달성된 후 별도의 DB로 옮겨져 내부 방침 및 기타 관련 법령에 의한 정보 보호 사유에 따라 일정 기간 저장된 후 파기됩니다.',
  '파기 방법: 전자적 파일 형태의 개인정보는 기록을 재생할 수 없는 기술적 방법을 사용하여 삭제합니다.',
]

// 단락당 약 8개 문단이 한 페이지에 해당하는 상수
const PARAGRAPHS_PER_PAGE = 8

export class MockHwpAdapter implements IHwpAdapter {
  private connected = false
  private paragraphs: string[]

  constructor() {
    // 내부 상태를 복사본으로 초기화 (편집이 원본에 영향을 주지 않도록)
    this.paragraphs = [...SAMPLE_PARAGRAPHS]
  }

  // ── HWP 프로세스 감지 ────────────────────────────────────

  findHwpWindow(): { hwnd: number; pid: number; title: string } | null {
    // Mock: HWP가 실행 중인 것처럼 가짜 결과 반환
    return {
      hwnd: 0x00120034,
      pid: 12345,
      title: '개인정보처리방침.hwp - 한글',
    }
  }

  // ── COM 연결 ─────────────────────────────────────────────

  connect(): boolean {
    this.connected = true
    console.log('[MockHwpAdapter] connect() — 연결 성공 (mock)')
    return true
  }

  disconnect(): void {
    this.connected = false
    console.log('[MockHwpAdapter] disconnect() — 연결 해제 (mock)')
  }

  isConnected(): boolean {
    return this.connected
  }

  // ── 문서 읽기 ────────────────────────────────────────────

  getFullText(): string {
    return this.paragraphs.join('\n')
  }

  getCursorPos(): { page: number; paragraph: number; charIndex: number } {
    return { page: 3, paragraph: 15, charIndex: 0 }
  }

  getTotalPages(): number {
    return Math.ceil(this.paragraphs.length / PARAGRAPHS_PER_PAGE)
  }

  getTextRange(startPage: number, endPage: number): string {
    const startIdx = Math.max(0, (startPage - 1) * PARAGRAPHS_PER_PAGE)
    const endIdx = Math.min(this.paragraphs.length, endPage * PARAGRAPHS_PER_PAGE)
    return this.paragraphs.slice(startIdx, endIdx).join('\n')
  }

  getSelectedText(): string | null {
    // Mock: 선택된 텍스트 없음
    return null
  }

  getParagraphText(paragraphIndex: number): string {
    // paragraphIndex는 1-based
    const idx = paragraphIndex - 1
    if (idx < 0 || idx >= this.paragraphs.length) {
      return ''
    }
    return this.paragraphs[idx]
  }

  // ── 문서 편집 ────────────────────────────────────────────

  insertAfterParagraph(paragraphIndex: number, text: string): void {
    // paragraphIndex는 1-based; 해당 문단 뒤에 삽입
    const insertAt = paragraphIndex // splice의 인덱스는 0-based이므로 1-based 그대로 사용하면 됨
    console.log(
      `[MockHwpAdapter] insertAfterParagraph(${paragraphIndex}) — "${text.slice(0, 40)}..."`,
    )
    this.paragraphs.splice(insertAt, 0, text)
  }

  findAndReplace(paragraphIndex: number, search: string, replacement: string): void {
    // paragraphIndex는 1-based
    const idx = paragraphIndex - 1
    if (idx < 0 || idx >= this.paragraphs.length) {
      console.warn(
        `[MockHwpAdapter] findAndReplace — 잘못된 문단 번호: ${paragraphIndex}`,
      )
      return
    }
    const original = this.paragraphs[idx]
    const updated = original.split(search).join(replacement)
    console.log(
      `[MockHwpAdapter] findAndReplace(${paragraphIndex}) — "${search}" → "${replacement}"`,
    )
    this.paragraphs[idx] = updated
  }

  deleteParagraph(paragraphIndex: number): void {
    // paragraphIndex는 1-based
    const idx = paragraphIndex - 1
    if (idx < 0 || idx >= this.paragraphs.length) {
      console.warn(
        `[MockHwpAdapter] deleteParagraph — 잘못된 문단 번호: ${paragraphIndex}`,
      )
      return
    }
    console.log(
      `[MockHwpAdapter] deleteParagraph(${paragraphIndex}) — "${this.paragraphs[idx].slice(0, 40)}..."`,
    )
    this.paragraphs.splice(idx, 1)
  }

  // ── 창 관리 ──────────────────────────────────────────────

  arrangeWindows(electronHwnd: number, ratio: number, swap: boolean): void {
    console.log(
      `[MockHwpAdapter] arrangeWindows(electronHwnd=${electronHwnd}, ratio=${ratio}, swap=${swap})`,
    )
  }
}
