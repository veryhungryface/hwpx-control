import { HwpStatusBar } from './HwpStatusBar'
import { MessageList } from './MessageList'
import { InputArea } from './InputArea'
import { useAppStore } from '../stores/app-store'

export function ChatArea() {
  const currentSessionId = useAppStore((s) => s.currentSessionId)

  return (
    <div className="flex flex-1 flex-col bg-surface dark:bg-surface-dark">
      <HwpStatusBar />

      {currentSessionId ? (
        <>
          <MessageList />
          <InputArea />
        </>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
            <span className="text-2xl font-bold text-primary">AI</span>
          </div>
          <h2 className="text-lg font-semibold text-gray-700 dark:text-gray-300">
            HWP AI Assistant
          </h2>
          <p className="max-w-xs text-center text-sm text-gray-400 dark:text-gray-500">
            왼쪽에서 대화를 선택하거나 새 대화를 시작하세요
          </p>
        </div>
      )}
    </div>
  )
}
