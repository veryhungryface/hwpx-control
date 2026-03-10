import { Sidebar } from './components/Sidebar'
import { ChatArea } from './components/ChatArea'
import { SettingsModal } from './components/SettingsModal'
import { useHwpStatus } from './hooks/useHwpStatus'
import { useStreaming } from './hooks/useStreaming'
import { useAppStore } from './stores/app-store'

export default function App() {
  useHwpStatus()
  useStreaming()

  const showSettings = useAppStore((s) => s.showSettings)

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-surface dark:bg-surface-dark">
      <Sidebar />
      <ChatArea />
      {showSettings && <SettingsModal />}
    </div>
  )
}
