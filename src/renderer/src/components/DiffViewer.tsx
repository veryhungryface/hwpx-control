import { useState } from 'react'
import { diffWords } from 'diff'
import type { EditCommand, EditStatus, NumberedParagraph } from '../../../shared/types'
import { useAppStore } from '../stores/app-store'

interface DiffViewerProps {
  edits: EditCommand[]
  messageId: string
  editStatus: EditStatus
  documentParagraphs?: NumberedParagraph[]
}

function ActionBadge({ action }: { action: EditCommand['action'] }) {
  const config = {
    insert: { label: '삽입', className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400' },
    replace: { label: '교체', className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400' },
    delete: { label: '삭제', className: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400' }
  }
  const { label, className } = config[action]
  return (
    <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold ${className}`}>
      {label}
    </span>
  )
}

function WordDiff({ original, modified }: { original: string; modified: string }) {
  const parts = diffWords(original, modified)
  return (
    <div className="mt-1 rounded-lg bg-white p-2.5 text-sm leading-relaxed dark:bg-gray-900/50">
      {parts.map((part, i) => {
        if (part.added) {
          return (
            <span
              key={i}
              className="rounded-sm bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
            >
              {part.value}
            </span>
          )
        }
        if (part.removed) {
          return (
            <span
              key={i}
              className="rounded-sm bg-red-100 text-red-700 line-through dark:bg-red-900/40 dark:text-red-400"
            >
              {part.value}
            </span>
          )
        }
        return <span key={i}>{part.value}</span>
      })}
    </div>
  )
}

export function DiffViewer({ edits, messageId, editStatus, documentParagraphs }: DiffViewerProps) {
  const updateMessage = useAppStore((s) => s.updateMessage)
  const [individualStatus, setIndividualStatus] = useState<Record<number, 'accepted' | 'rejected'>>({})
  const isResolved = editStatus === 'accepted' || editStatus === 'rejected'

  const handleAcceptAll = async () => {
    try {
      await window.api.hwp.applyEdits(edits)
      updateMessage(messageId, { editStatus: 'accepted' })
    } catch {
      // Error is handled by the main process
    }
  }

  const handleRejectAll = () => {
    updateMessage(messageId, { editStatus: 'rejected' })
  }

  const handleAcceptOne = async (index: number) => {
    try {
      await window.api.hwp.applyEdits([edits[index]])
      setIndividualStatus((prev) => ({ ...prev, [index]: 'accepted' }))
      checkPartialStatus(index, 'accepted')
    } catch {
      // Error is handled by the main process
    }
  }

  const handleRejectOne = (index: number) => {
    setIndividualStatus((prev) => ({ ...prev, [index]: 'rejected' }))
    checkPartialStatus(index, 'rejected')
  }

  const checkPartialStatus = (currentIndex: number, status: 'accepted' | 'rejected') => {
    const next = { ...individualStatus, [currentIndex]: status }
    const allResolved = edits.every((_, i) => next[i] != null)
    if (allResolved) {
      const allAccepted = edits.every((_, i) => next[i] === 'accepted')
      const allRejected = edits.every((_, i) => next[i] === 'rejected')
      if (allAccepted) updateMessage(messageId, { editStatus: 'accepted' })
      else if (allRejected) updateMessage(messageId, { editStatus: 'rejected' })
      else updateMessage(messageId, { editStatus: 'partial' })
    }
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50/50 dark:border-gray-700 dark:bg-gray-800/30">
      {/* Header with bulk actions */}
      <div className="flex items-center justify-between border-b border-gray-200 px-3 py-2 dark:border-gray-700">
        <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">
          편집 제안 ({edits.length}건)
        </span>

        {!isResolved && editStatus !== 'partial' && (
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleAcceptAll}
              className="rounded-md bg-emerald-500 px-2.5 py-1 text-[11px] font-medium text-white transition-colors hover:bg-emerald-600"
            >
              전체 수락
            </button>
            <button
              onClick={handleRejectAll}
              className="rounded-md bg-gray-200 px-2.5 py-1 text-[11px] font-medium text-gray-600 transition-colors hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
            >
              전체 거절
            </button>
          </div>
        )}

        {isResolved && (
          <span
            className={`text-[11px] font-medium ${
              editStatus === 'accepted'
                ? 'text-emerald-600 dark:text-emerald-400'
                : editStatus === 'rejected'
                  ? 'text-red-500 dark:text-red-400'
                  : 'text-amber-600 dark:text-amber-400'
            }`}
          >
            {editStatus === 'accepted' && '수락됨'}
            {editStatus === 'rejected' && '거절됨'}
          </span>
        )}

        {editStatus === 'partial' && (
          <span className="text-[11px] font-medium text-amber-600 dark:text-amber-400">
            부분 적용됨
          </span>
        )}
      </div>

      {/* Edit items */}
      <div className="divide-y divide-gray-100 dark:divide-gray-700/50">
        {edits.map((edit, index) => {
          const itemStatus = individualStatus[index]
          const itemResolved = isResolved || itemStatus != null

          return (
            <div key={index} className="px-3 py-2.5">
              {/* Edit header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ActionBadge action={edit.action} />
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {edit.paragraph}번 문단
                  </span>
                </div>

                {!isResolved && !itemResolved && (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleAcceptOne(index)}
                      className="rounded px-2 py-0.5 text-[10px] font-medium text-emerald-600 transition-colors hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-900/20"
                    >
                      수락
                    </button>
                    <button
                      onClick={() => handleRejectOne(index)}
                      className="rounded px-2 py-0.5 text-[10px] font-medium text-gray-500 transition-colors hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700/50"
                    >
                      거절
                    </button>
                  </div>
                )}

                {itemResolved && !isResolved && (
                  <span
                    className={`text-[10px] font-medium ${
                      itemStatus === 'accepted'
                        ? 'text-emerald-500'
                        : 'text-gray-400'
                    }`}
                  >
                    {itemStatus === 'accepted' ? '수락됨' : '거절됨'}
                  </span>
                )}
              </div>

              {/* Edit content */}
              <div className="mt-1.5">
                {edit.action === 'replace' && edit.search && edit.text && (
                  <WordDiff original={edit.search} modified={edit.text} />
                )}

                {edit.action === 'insert' && edit.text && (
                  <div className="mt-1 rounded-lg bg-emerald-50 p-2.5 text-sm leading-relaxed text-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300">
                    {edit.text}
                  </div>
                )}

                {edit.action === 'delete' && edit.search && (
                  <div className="mt-1 rounded-lg bg-red-50 p-2.5 text-sm leading-relaxed text-red-700 line-through dark:bg-red-900/20 dark:text-red-400">
                    {edit.search}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
