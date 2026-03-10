import { useAppStore } from '../stores/app-store'

export function HwpStatusBar() {
  const hwpStatus = useAppStore((s) => s.hwpStatus)
  const mode = useAppStore((s) => s.mode)
  const setMode = useAppStore((s) => s.setMode)

  const statusDotColor = hwpStatus.connected
    ? 'bg-emerald-400'
    : 'bg-gray-400'

  const statusText = hwpStatus.connected
    ? 'HWP 연결됨'
    : 'HWP를 실행해주세요'

  return (
    <div className="flex items-center justify-between border-b border-gray-100 bg-white/60 px-4 py-2 backdrop-blur-sm dark:border-gray-800 dark:bg-gray-900/60">
      {/* Left: status */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <span
            className={`inline-block h-2 w-2 rounded-full ${statusDotColor}`}
          />
          <span className="text-xs text-gray-600 dark:text-gray-400">
            {statusText}
          </span>
        </div>

        {hwpStatus.connected && hwpStatus.docName && (
          <>
            <span className="text-gray-300 dark:text-gray-600">|</span>
            <span className="max-w-[200px] truncate text-xs font-medium text-gray-700 dark:text-gray-300">
              {hwpStatus.docName}
            </span>
          </>
        )}

        {hwpStatus.connected &&
          hwpStatus.cursorPage != null &&
          hwpStatus.totalPages != null && (
            <>
              <span className="text-gray-300 dark:text-gray-600">|</span>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {hwpStatus.cursorPage}/{hwpStatus.totalPages} 페이지
              </span>
            </>
          )}
      </div>

      {/* Right: mode toggle */}
      <div className="flex items-center rounded-lg bg-gray-100 p-0.5 dark:bg-gray-800">
        <button
          onClick={() => setMode('edit')}
          className={`rounded-md px-2.5 py-1 text-xs font-medium transition-all ${
            mode === 'edit'
              ? 'bg-white text-primary shadow-sm dark:bg-gray-700'
              : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
          }`}
        >
          편집 모드
        </button>
        <button
          onClick={() => setMode('chat')}
          className={`rounded-md px-2.5 py-1 text-xs font-medium transition-all ${
            mode === 'chat'
              ? 'bg-white text-primary shadow-sm dark:bg-gray-700'
              : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
          }`}
        >
          대화 모드
        </button>
      </div>
    </div>
  )
}
