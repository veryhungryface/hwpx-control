import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import type { DocumentContext, EditCommand } from '../../shared/types'
import { DEFAULTS } from '../../shared/constants'

// ──────────────────────────────────────
// 시스템 프롬프트 빌더
// ──────────────────────────────────────

function formatParagraphs(context: DocumentContext): string {
  return context.paragraphs
    .map((p) => {
      const text = p.text.trim()
      return text.length === 0 ? `[P${p.index}] (빈 줄)` : `[P${p.index}] ${p.text}`
    })
    .join('\n')
}

function buildEditModePrompt(context: DocumentContext, numberedText?: string | null): string {
  const [startPage, endPage] = context.pageRange
  // 넘버링된 텍스트가 있으면 사용, 없으면 기존 방식
  const paragraphsDisplay = numberedText || formatParagraphs(context)

  return `당신은 HWP 문서 편집 AI 비서입니다.

## 역할
사용자가 제공하는 한글 문서 텍스트를 분석하고, 요청에 따라 정확한 편집 명령을 생성합니다.

## 문서 형식
- 문서 텍스트는 P1:, P2:, P3:... 형태의 문단 번호가 붙어 있습니다.
- 각 번호는 해당 문단의 고유 식별자입니다.
- 빈 줄은 번호가 없으며 건너뜁니다.

## 응답 규칙
1. 먼저 자연어로 어떤 편집을 왜 하는지 간단히 설명합니다.
2. 편집이 필요하면 반드시 <edit> 태그 안에 JSON 배열로 명령을 작성합니다.
3. 편집이 불필요한 질문(예: "이 문단이 무슨 뜻이야?")에는 <edit> 태그 없이 답변만 합니다.
4. 하나의 응답에 여러 편집을 포함할 수 있습니다.

## 편집 명령 형식
<edit>
[
  {
    "action": "replace",
    "paragraph": 5,
    "search": "교체할 원본 텍스트 (문단 내 정확한 부분 문자열)",
    "text": "새로운 텍스트"
  },
  {
    "action": "insert",
    "paragraph": 10,
    "search": "이 텍스트 뒤에 삽입할 앵커",
    "text": "앵커 뒤에 삽입될 새 텍스트"
  },
  {
    "action": "delete",
    "paragraph": 15,
    "search": "삭제할 텍스트"
  }
]
</edit>

## 중요 — search 필드 규칙
- **replace**: "search"는 문서에서 **정확히 일치**하는 부분 문자열이어야 합니다. 문서 전체에서 고유한 텍스트를 사용하세요.
- **insert**: "search"는 삽입 위치를 지정하는 앵커 텍스트입니다. 이 텍스트 뒤에 새 텍스트가 추가됩니다.
- **delete**: "search"는 삭제할 정확한 텍스트입니다.
- 여러 곳을 동시에 편집할 때, paragraph 번호 참조로 위치를 알려주세요.
- 확실하지 않은 편집은 하지 마세요. 대신 사용자에게 확인을 요청하세요.

## 현재 문서 (페이지 ${startPage}~${endPage})
${paragraphsDisplay}`
}

function buildChatModePrompt(context: DocumentContext, numberedText?: string | null): string {
  const [startPage, endPage] = context.pageRange
  const paragraphsDisplay = numberedText || formatParagraphs(context)

  return `당신은 HWP 문서에 대해 대화하는 AI 비서입니다.

## 역할
사용자가 제공하는 한글 문서에 대해 질문에 답하고, 내용을 분석하고, 조언을 제공합니다.
문서를 직접 편집하지는 않습니다.

## 응답 규칙
- <edit> 태그를 사용하지 마세요. 편집 명령을 생성하지 마세요.
- 문서 내용에 기반한 정확한 답변을 제공하세요.
- 문서에 없는 내용은 추측하지 말고 모른다고 말하세요.
- 마크다운 형식으로 깔끔하게 답변하세요.

## 현재 문서 (페이지 ${startPage}~${endPage})
${paragraphsDisplay}`
}

// ──────────────────────────────────────
// 토큰 추정
// ──────────────────────────────────────

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3)
}

// ──────────────────────────────────────
// AiService
// ──────────────────────────────────────

interface ChatParams {
  messages: Array<{ role: string; content: string }>
  documentContext: DocumentContext | null
  numberedText?: string | null
  mode: 'edit' | 'chat'
  onChunk: (chunk: string) => void
  signal?: AbortSignal
}

interface ChatResult {
  content: string
  edits: EditCommand[] | null
  inputTokens: number
  outputTokens: number
}

export class AiService {
  private apiKeys: Record<'claude' | 'openai', string> = {
    claude: '',
    openai: ''
  }
  private provider: 'claude' | 'openai' = DEFAULTS.AI_PROVIDER
  private model: string = DEFAULTS.MODEL

  // API 키 설정
  setApiKey(provider: 'claude' | 'openai', key: string): void {
    this.apiKeys[provider] = key
    this.provider = provider
  }

  // 모델 설정
  setModel(model: string): void {
    this.model = model
  }

  // 시스템 프롬프트 구성
  private buildSystemPrompt(
    documentContext: DocumentContext | null,
    mode: 'edit' | 'chat',
    numberedText?: string | null
  ): string {
    if (documentContext) {
      return mode === 'edit'
        ? buildEditModePrompt(documentContext, numberedText)
        : buildChatModePrompt(documentContext, numberedText)
    }
    return mode === 'edit'
      ? '당신은 HWP 문서 편집 AI 비서입니다. 현재 연결된 문서가 없습니다.'
      : '당신은 HWP 문서에 대해 대화하는 AI 비서입니다. 현재 연결된 문서가 없습니다.'
  }

  // 채팅 (스트리밍) — provider에 따라 분기
  async chat(params: ChatParams): Promise<ChatResult> {
    const activeProvider = this.provider
    const key = this.apiKeys[activeProvider]

    if (!key) {
      throw new Error(
        activeProvider === 'claude'
          ? 'Claude API 키가 설정되지 않았습니다.'
          : 'OpenAI API 키가 설정되지 않았습니다.'
      )
    }

    if (activeProvider === 'openai') {
      return this.chatOpenAI(params, key)
    }
    return this.chatClaude(params, key)
  }

  // ── Claude 스트리밍 ────────────────────

  private async chatClaude(params: ChatParams, apiKey: string): Promise<ChatResult> {
    const { messages, documentContext, numberedText, mode, onChunk, signal } = params

    const systemPrompt = this.buildSystemPrompt(documentContext, mode, numberedText)
    this.warnTokenBudget(systemPrompt, messages)

    const client = new Anthropic({ apiKey })

    const anthropicMessages = messages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content
      }))

    let fullContent = ''
    let inputTokens = 0
    let outputTokens = 0

    const stream = client.messages.stream(
      {
        model: this.model,
        max_tokens: 4096,
        system: systemPrompt,
        messages: anthropicMessages
      },
      { signal }
    )

    for await (const event of stream) {
      if (event.type === 'content_block_delta') {
        if (event.delta.type === 'text_delta') {
          const chunk = event.delta.text
          fullContent += chunk
          onChunk(chunk)
        }
      } else if (event.type === 'message_delta') {
        if (event.usage) {
          outputTokens = event.usage.output_tokens
        }
      } else if (event.type === 'message_start') {
        if (event.message.usage) {
          inputTokens = event.message.usage.input_tokens
        }
      }
    }

    const finalMessage = await stream.finalMessage()
    inputTokens = finalMessage.usage.input_tokens
    outputTokens = finalMessage.usage.output_tokens

    const { text, edits } = AiService.parseEditCommands(fullContent)
    return { content: text, edits, inputTokens, outputTokens }
  }

  // ── OpenAI 스트리밍 ────────────────────

  private async chatOpenAI(params: ChatParams, apiKey: string): Promise<ChatResult> {
    const { messages, documentContext, numberedText, mode, onChunk, signal } = params

    const systemPrompt = this.buildSystemPrompt(documentContext, mode, numberedText)
    this.warnTokenBudget(systemPrompt, messages)

    const client = new OpenAI({ apiKey })

    const openaiMessages: OpenAI.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...messages
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content
        }))
    ]

    let fullContent = ''
    let inputTokens = 0
    let outputTokens = 0

    const stream = await client.chat.completions.create(
      {
        model: this.model,
        max_tokens: 4096,
        messages: openaiMessages,
        stream: true,
        stream_options: { include_usage: true }
      },
      { signal }
    )

    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta
      if (delta?.content) {
        fullContent += delta.content
        onChunk(delta.content)
      }
      // Usage is reported in the final chunk
      if (chunk.usage) {
        inputTokens = chunk.usage.prompt_tokens ?? 0
        outputTokens = chunk.usage.completion_tokens ?? 0
      }
    }

    const { text, edits } = AiService.parseEditCommands(fullContent)
    return { content: text, edits, inputTokens, outputTokens }
  }

  // ── 토큰 버짓 경고 ────────────────────

  private warnTokenBudget(systemPrompt: string, messages: Array<{ content: string }>): void {
    const systemTokens = estimateTokens(systemPrompt)
    const messagesTokens = messages.reduce((sum, m) => sum + estimateTokens(m.content), 0)
    const totalEstimated = systemTokens + messagesTokens
    if (totalEstimated > DEFAULTS.TOKEN_BUDGET) {
      console.warn(
        `[AiService] 추정 토큰(${totalEstimated})이 버짓(${DEFAULTS.TOKEN_BUDGET})을 초과합니다.`
      )
    }
  }

  // 편집 명령 파싱 (public static for testing)
  static parseEditCommands(response: string): { text: string; edits: EditCommand[] | null } {
    const editRegex = /<edit>([\s\S]*?)<\/edit>/

    const match = response.match(editRegex)
    if (!match) {
      return { text: response.trim(), edits: null }
    }

    // <edit> 태그 제거한 순수 텍스트
    const text = response.replace(editRegex, '').trim()

    try {
      const parsed: unknown = JSON.parse(match[1].trim())

      if (!Array.isArray(parsed)) {
        throw new Error('편집 명령이 배열 형식이 아닙니다.')
      }

      const edits: EditCommand[] = []
      for (const item of parsed) {
        if (typeof item !== 'object' || item === null) {
          throw new Error('편집 명령 항목이 객체가 아닙니다.')
        }
        const cmd = item as Record<string, unknown>

        if (!['insert', 'replace', 'delete'].includes(cmd.action as string)) {
          throw new Error(`알 수 없는 action: ${cmd.action}`)
        }
        if (typeof cmd.paragraph !== 'number' || cmd.paragraph < 1) {
          throw new Error(`유효하지 않은 paragraph: ${cmd.paragraph}`)
        }

        edits.push({
          action: cmd.action as 'insert' | 'replace' | 'delete',
          paragraph: cmd.paragraph as number,
          ...(cmd.search !== undefined && { search: String(cmd.search) }),
          ...(cmd.text !== undefined && { text: String(cmd.text) })
        })
      }

      return { text, edits }
    } catch (e) {
      console.error('[AiService] 편집 명령 파싱 실패:', e)
      return { text: response.trim(), edits: null }
    }
  }
}
