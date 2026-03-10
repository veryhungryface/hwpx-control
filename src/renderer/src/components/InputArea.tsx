import { useState, useRef, useCallback, type KeyboardEvent, type DragEvent } from 'react'
import { useAppStore } from '../stores/app-store'

export function InputArea() {
  const [text, setText] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const [attachedFiles, setAttachedFiles] = useState<File[]>([])
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const isStreaming = useAppStore((s) => s.isStreaming)
  const startStreaming = useAppStore((s) => s.startStreaming)
  const addMessage = useAppStore((s) => s.addMessage)
  const currentSessionId = useAppStore((s) => s.currentSessionId)
  const mode = useAppStore((s) => s.mode)

  const adjustHeight = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    const maxHeight = 6 * 24 // ~6 rows
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`
  }, [])

  const handleSend = useCallback(async () => {
    const trimmed = text.trim()
    if (!trimmed || !currentSessionId) return

    // Add user message optimistically
    const userMessage = {
      id: `temp-${Date.now()}`,
      sessionId: currentSessionId,
      role: 'user' as const,
      content: trimmed,
      edits: null,
      editStatus: 'none' as const,
      tokenInput: null,
      tokenOutput: null,
      createdAt: new Date().toISOString()
    }
    addMessage(userMessage)
    setText('')
    setAttachedFiles([])

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }

    // Start streaming and call AI
    startStreaming()
    await window.api.ai.chat({
      sessionId: currentSessionId,
      userMessage: trimmed,
      mode
    })
  }, [text, currentSessionId, addMessage, startStreaming, mode])

  const handleCancel = useCallback(() => {
    if (currentSessionId) {
      window.api.ai.cancel(currentSessionId)
    }
  }, [currentSessionId])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        if (!isStreaming) {
          handleSend()
        }
      }
    },
    [isStreaming, handleSend]
  )

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback((e: DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const files = Array.from(e.dataTransfer.files)
    if (files.length > 0) {
      setAttachedFiles((prev) => [...prev, ...files])
    }
  }, [])

  const removeFile = useCallback((index: number) => {
    setAttachedFiles((prev) => prev.filter((_, i) => i !== index))
  }, [])

  return (
    <div className="border-t border-gray-100 bg-white/80 px-4 py-3 backdrop-blur-sm dark:border-gray-800 dark:bg-gray-900/80">
      <div className="mx-auto max-w-3xl">
        {/* Attached files */}
        {attachedFiles.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {attachedFiles.map((file, i) => (
              <div
                key={i}
                className="flex items-center gap-1.5 rounded-lg bg-gray-100 px-2.5 py-1 text-xs dark:bg-gray-800"
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-gray-400"
                >
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
                <span className="max-w-[120px] truncate text-gray-600 dark:text-gray-300">
                  {file.name}
                </span>
                <button
                  onClick={() => removeFile(i)}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                >
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Input container */}
        <div
          className={`relative flex items-end gap-2 rounded-2xl border bg-white px-3 py-2 transition-colors dark:bg-gray-900 ${
            isDragging
              ? 'border-primary border-dashed'
              : 'border-gray-200 dark:border-gray-700'
          }`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {/* Drag overlay */}
          {isDragging && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-2xl bg-primary/5">
              <span className="text-xs font-medium text-primary">
                파일을 여기에 놓으세요
              </span>
            </div>
          )}

          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => {
              setText(e.target.value)
              adjustHeight()
            }}
            onKeyDown={handleKeyDown}
            placeholder={
              isStreaming ? '응답 생성 중...' : '메시지를 입력하세요...'
            }
            disabled={isStreaming}
            rows={1}
            className="max-h-36 min-h-[24px] flex-1 resize-none bg-transparent text-sm text-gray-800 outline-none placeholder:text-gray-400 disabled:opacity-50 dark:text-gray-200 dark:placeholder:text-gray-500"
          />

          {/* Send / Cancel button */}
          {isStreaming ? (
            <button
              onClick={handleCancel}
              className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-red-500 text-white transition-colors hover:bg-red-600"
              title="중단"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <rect x="6" y="6" width="12" height="12" rx="1" />
              </svg>
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!text.trim() || !currentSessionId}
              className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-primary text-white transition-colors hover:bg-primary-hover disabled:opacity-30 disabled:hover:bg-primary"
              title="전송"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="12" y1="19" x2="12" y2="5" />
                <polyline points="5 12 12 5 19 12" />
              </svg>
            </button>
          )}
        </div>

        <p className="mt-1.5 text-center text-[10px] text-gray-400 dark:text-gray-500">
          Enter로 전송, Shift+Enter로 줄바꿈
        </p>
      </div>
    </div>
  )
}
