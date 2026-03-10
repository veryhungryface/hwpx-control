import ReactMarkdown from 'react-markdown'
import type { Message } from '../../../shared/types'
import { DiffViewer } from './DiffViewer'

interface AssistantMessageProps {
  message: Message
  isStreaming?: boolean
}

export function AssistantMessage({ message, isStreaming }: AssistantMessageProps) {
  const time = new Date(message.createdAt).toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit'
  })

  return (
    <div className="flex justify-start">
      <div className="max-w-[90%]">
        {/* Avatar + content */}
        <div className="flex items-start gap-2.5">
          <div className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-800">
            <span className="text-[10px] font-bold text-primary">AI</span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="rounded-2xl rounded-tl-md bg-gray-50 px-4 py-2.5 dark:bg-gray-800/80">
              <div className="prose prose-sm max-w-none dark:prose-invert prose-p:my-1 prose-pre:my-2 prose-pre:bg-gray-100 prose-pre:dark:bg-gray-900 prose-code:text-primary prose-code:before:content-none prose-code:after:content-none">
                <ReactMarkdown
                  components={{
                    pre: ({ children }) => (
                      <pre className="overflow-x-auto rounded-lg bg-gray-100 p-3 text-xs dark:bg-gray-900">
                        {children}
                      </pre>
                    ),
                    code: ({ children, className }) => {
                      const isInline = !className
                      return isInline ? (
                        <code className="rounded bg-gray-100 px-1 py-0.5 text-xs text-primary dark:bg-gray-900">
                          {children}
                        </code>
                      ) : (
                        <code className={className}>{children}</code>
                      )
                    }
                  }}
                >
                  {message.content}
                </ReactMarkdown>
              </div>

              {/* Streaming cursor */}
              {isStreaming && (
                <span className="inline-block h-4 w-0.5 animate-pulse bg-primary" />
              )}
            </div>

            {/* Diff viewer for edits */}
            {message.edits && message.edits.length > 0 && (
              <div className="mt-2">
                <DiffViewer
                  edits={message.edits}
                  messageId={message.id}
                  editStatus={message.editStatus}
                />
              </div>
            )}

            {/* Timestamp */}
            {!isStreaming && (
              <div className="mt-1">
                <span className="text-[10px] text-gray-400 dark:text-gray-500">
                  {time}
                </span>
                {message.tokenInput != null && message.tokenOutput != null && (
                  <span className="ml-2 text-[10px] text-gray-300 dark:text-gray-600">
                    {message.tokenInput + message.tokenOutput} tokens
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
