import { useState } from 'react'
import type { EditCommand, EditStatus } from '../../../shared/types'
import { useAppStore } from '../stores/app-store'

interface DiffViewerProps {
  edits: EditCommand[]
  messageId: string
  editStatus: EditStatus
}

function ActionBadge({ action }: { action: EditCommand['action'] }) {
  const config = {
    insert: { label: '삽입', bg: 'bg-emerald-500' },
    replace: { label: '교체', bg: 'bg-amber-500' },
    delete: { label: '삭제', bg: 'bg-red-500' }
  }
  const { label, bg } = config[action]
  return (
    <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold text-white ${bg}`}>
      {label}
    </span>
  )
}

export function DiffViewer({ edits, messageId, editStatus }: DiffViewerProps) {
  const updateMessage = useAppStore((s) => s.updateMessage)
  const [isApplying, setIsApplying] = useState(false)
  const [showDetail, setShowDetail] = useState(false)
  const isResolved = editStatus === 'accepted' || editStatus === 'rejected' || editStatus === 'partial'

  const handleAcceptAll = async () => {
    setIsApplying(true)
    try {
      // SendKeys로 HWP 보이는 문서에 직접 편집 적용
      const result = await window.api.hwp.applyEdits(edits, messageId)
      if (result.applied > 0) {
        updateMessage(messageId, { editStatus: 'accepted' })
      } else {
        updateMessage(messageId, { editStatus: 'partial' })
      }
    } catch (e) {
      console.error('[DiffViewer] acceptAll failed:', e)
    } finally {
      setIsApplying(false)
    }
  }

  const handleRejectAll = async () => {
    // 아직 HWP에 적용되지 않았으므로 상태만 변경
    updateMessage(messageId, { editStatus: 'rejected' })
  }

  // Summary
  const insertCount = edits.filter((e) => e.action === 'insert').length
  const replaceCount = edits.filter((e) => e.action === 'replace').length
  const deleteCount = edits.filter((e) => e.action === 'delete').length

  // Already resolved
  if (isResolved) {
    return (
      <div
        className={`flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium ${
          editStatus === 'accepted'
            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400'
            : editStatus === 'rejected'
              ? 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
              : 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400'
        }`}
      >
        {editStatus === 'accepted' && (
          <>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            편집이 문서에 적용되었습니다
          </>
        )}
        {editStatus === 'rejected' && (
          <>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
            편집이 거절되었습니다
          </>
        )}
        {editStatus === 'partial' && (
          <>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            일부 편집이 적용되었습니다
          </>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Edit summary - clickable to expand */}
      <button
        onClick={() => setShowDetail(!showDetail)}
        className="flex w-full items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-left transition-colors hover:bg-gray-100 dark:bg-gray-800/50 dark:hover:bg-gray-800"
      >
        <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
          편집 제안 {edits.length}건
          <span className="ml-2 text-gray-400 dark:text-gray-500">
            {replaceCount > 0 && `교체 ${replaceCount}`}
            {insertCount > 0 && `${replaceCount > 0 ? ' · ' : ''}삽입 ${insertCount}`}
            {deleteCount > 0 && `${replaceCount + insertCount > 0 ? ' · ' : ''}삭제 ${deleteCount}`}
          </span>
        </span>
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`text-gray-400 transition-transform ${showDetail ? 'rotate-180' : ''}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {/* Detail view */}
      {showDetail && (
        <div className="space-y-2">
          {edits.map((edit, index) => (
            <div
              key={index}
              className="rounded-lg border border-gray-100 bg-white p-3 dark:border-gray-700/50 dark:bg-gray-800/30"
            >
              <div className="mb-1.5 flex items-center gap-2">
                <ActionBadge action={edit.action} />
                <span className="text-[11px] text-gray-500 dark:text-gray-400">
                  {edit.paragraph}번 문단
                </span>
              </div>

              {edit.action === 'replace' && (
                <div className="space-y-1 text-sm leading-relaxed">
                  {edit.search && (
                    <div className="rounded bg-red-50 px-2.5 py-1.5 text-red-700 line-through dark:bg-red-900/20 dark:text-red-400">
                      {edit.search.length > 120 ? edit.search.slice(0, 120) + '...' : edit.search}
                    </div>
                  )}
                  {edit.text && (
                    <div className="rounded bg-emerald-50 px-2.5 py-1.5 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300">
                      {edit.text.length > 120 ? edit.text.slice(0, 120) + '...' : edit.text}
                    </div>
                  )}
                </div>
              )}

              {edit.action === 'insert' && edit.text && (
                <div className="rounded bg-emerald-50 px-2.5 py-1.5 text-sm leading-relaxed text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300">
                  {edit.text.length > 200 ? edit.text.slice(0, 200) + '...' : edit.text}
                </div>
              )}

              {edit.action === 'delete' && (
                <div className="rounded bg-red-50 px-2.5 py-1.5 text-sm leading-relaxed text-red-700 line-through dark:bg-red-900/20 dark:text-red-400">
                  {(edit.search || '(문단 삭제)').length > 120
                    ? (edit.search || '').slice(0, 120) + '...'
                    : edit.search || '(문단 삭제)'}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Accept / Reject cards */}
      <div className="grid grid-cols-2 gap-2.5">
        <button
          onClick={handleAcceptAll}
          disabled={isApplying}
          className="flex flex-col items-center gap-2 rounded-xl border-2 border-emerald-200 bg-emerald-50 px-4 py-4 transition-all hover:border-emerald-300 hover:bg-emerald-100 active:scale-[0.98] disabled:opacity-50 dark:border-emerald-800 dark:bg-emerald-900/20 dark:hover:bg-emerald-900/30"
        >
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-emerald-500"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
            {isApplying ? '적용 중...' : 'AI 제안 전체 수락'}
          </span>
        </button>

        <button
          onClick={handleRejectAll}
          disabled={isApplying}
          className="flex flex-col items-center gap-2 rounded-xl border-2 border-gray-200 bg-gray-50 px-4 py-4 transition-all hover:border-gray-300 hover:bg-gray-100 active:scale-[0.98] disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800/50 dark:hover:bg-gray-800"
        >
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-red-400"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
          <span className="text-sm font-semibold text-gray-600 dark:text-gray-300">
            AI 제안 전체 거절
          </span>
        </button>
      </div>
    </div>
  )
}
