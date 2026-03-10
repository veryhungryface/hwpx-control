import { useAppStore } from '../stores/app-store'
import { useSession } from '../hooks/useSession'

export function Sidebar() {
  const sessions = useAppStore((s) => s.sessions)
  const currentSessionId = useAppStore((s) => s.currentSessionId)
  const setShowSettings = useAppStore((s) => s.setShowSettings)
  const { loadSession, createSession, deleteSession } = useSession()

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    if (diffDays === 0) {
      return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
    }
    if (diffDays === 1) return '어제'
    if (diffDays < 7) return `${diffDays}일 전`
    return d.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })
  }

  return (
    <aside className="flex w-56 flex-col border-r border-gray-200 bg-sidebar dark:border-gray-700 dark:bg-sidebar-dark">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-4">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-xs font-bold text-white">
          AI
        </div>
        <span className="text-base font-semibold text-gray-900 dark:text-gray-100">
          HWP AI
        </span>
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto px-2">
        {sessions.length === 0 && (
          <p className="px-2 py-8 text-center text-xs text-gray-400 dark:text-gray-500">
            대화가 없습니다
          </p>
        )}
        {sessions.map((session) => {
          const isActive = session.id === currentSessionId
          return (
            <div
              key={session.id}
              className="group relative"
            >
              <button
                onClick={() => loadSession(session.id)}
                className={`w-full rounded-lg px-3 py-2.5 text-left transition-colors ${
                  isActive
                    ? 'bg-primary/10 text-primary dark:bg-primary/20'
                    : 'text-gray-700 hover:bg-gray-200/60 dark:text-gray-300 dark:hover:bg-gray-700/40'
                }`}
              >
                <div className="truncate text-sm font-medium leading-tight">
                  {session.title || '새 대화'}
                </div>
                <div className="mt-0.5 flex items-center gap-1.5">
                  <span
                    className={`text-[10px] ${
                      isActive
                        ? 'text-primary/60'
                        : 'text-gray-400 dark:text-gray-500'
                    }`}
                  >
                    {session.mode === 'edit' ? '편집' : '대화'}
                  </span>
                  <span className="text-gray-300 dark:text-gray-600">·</span>
                  <span
                    className={`text-[10px] ${
                      isActive
                        ? 'text-primary/60'
                        : 'text-gray-400 dark:text-gray-500'
                    }`}
                  >
                    {formatDate(session.updatedAt)}
                  </span>
                </div>
              </button>

              {/* Delete button on hover */}
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  deleteSession(session.id)
                }}
                className="absolute right-1.5 top-1.5 hidden rounded p-0.5 text-gray-400 hover:bg-gray-300/50 hover:text-gray-600 group-hover:block dark:hover:bg-gray-600/50 dark:hover:text-gray-300"
                title="삭제"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          )
        })}
      </div>

      {/* Divider */}
      <div className="mx-3 border-t border-gray-200 dark:border-gray-700" />

      {/* Bottom buttons */}
      <div className="flex flex-col gap-1 p-2">
        <button
          onClick={createSession}
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200/60 dark:text-gray-300 dark:hover:bg-gray-700/40"
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
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          새 대화
        </button>
        <button
          onClick={() => setShowSettings(true)}
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200/60 dark:text-gray-300 dark:hover:bg-gray-700/40"
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
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
          설정
        </button>
      </div>
    </aside>
  )
}
