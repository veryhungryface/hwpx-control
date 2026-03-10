import { useEffect, useRef } from 'react'
import { useAppStore } from '../stores/app-store'
import { UserMessage } from './UserMessage'
import { AssistantMessage } from './AssistantMessage'

export function MessageList() {
  const messages = useAppStore((s) => s.messages)
  const isStreaming = useAppStore((s) => s.isStreaming)
  const streamingContent = useAppStore((s) => s.streamingContent)
  const bottomRef = useRef<HTMLDivElement>(null)

  // Auto-scroll on new messages or streaming content
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingContent])

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl px-4 py-6">
        {messages.length === 0 && !isStreaming && (
          <div className="flex flex-col items-center gap-2 py-20 text-center">
            <p className="text-sm text-gray-400 dark:text-gray-500">
              메시지를 입력하여 대화를 시작하세요
            </p>
          </div>
        )}

        <div className="flex flex-col gap-4">
          {messages.map((msg) => {
            if (msg.role === 'user') {
              return <UserMessage key={msg.id} message={msg} />
            }
            if (msg.role === 'assistant') {
              return <AssistantMessage key={msg.id} message={msg} />
            }
            return null
          })}

          {/* Streaming message */}
          {isStreaming && streamingContent && (
            <AssistantMessage
              message={{
                id: '__streaming__',
                sessionId: '',
                role: 'assistant',
                content: streamingContent,
                edits: null,
                editStatus: 'none',
                tokenInput: null,
                tokenOutput: null,
                createdAt: new Date().toISOString()
              }}
              isStreaming
            />
          )}

          {/* Streaming indicator when no content yet */}
          {isStreaming && !streamingContent && (
            <div className="flex items-center gap-2 pl-1">
              <div className="flex items-center gap-1">
                <span className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-primary [animation-delay:0ms]" />
                <span className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-primary [animation-delay:150ms]" />
                <span className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-primary [animation-delay:300ms]" />
              </div>
              <span className="text-xs text-gray-400">생각 중...</span>
            </div>
          )}
        </div>

        <div ref={bottomRef} />
      </div>
    </div>
  )
}
