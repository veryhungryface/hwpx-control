import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { initDatabase } from './services/db'
import { MockHwpAdapter } from './services/hwp-adapter'
import { Win32HwpAdapter } from './services/win32-hwp-adapter'
import { HwpService } from './services/hwp-service'
import { AiService } from './services/ai-service'
import { registerIpcHandlers } from './ipc-handlers'
import { DEFAULTS, IPC } from '../shared/constants'

let mainWindow: BrowserWindow | null = null

// ─────────────────────────────────────────────────────────────
// createWindow
// ─────────────────────────────────────────────────────────────

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 480,
    height: 720,
    minWidth: 380,
    minHeight: 500,
    title: 'HWP AI Assistant',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  // Show window once ready to avoid flickering
  win.on('ready-to-show', () => {
    win.show()
  })

  // Open external links in the system browser instead of Electron
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  // Load the renderer
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

// ─────────────────────────────────────────────────────────────
// app lifecycle
// ─────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  // Set app user model ID for Windows taskbar/notifications
  electronApp.setAppUserModelId('com.hwp-ai-assistant')

  // Default open-devtools shortcut (F12) and close shortcut (Ctrl+W)
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // ── Initialize database services ──────────────────────────

  const dbPath = join(app.getPath('userData'), DEFAULTS.DB_FILENAME)
  const { sessions, messages, editHistory, settings } = initDatabase(dbPath)

  // ── Initialize HWP service ────────────────────────────────

  // Windows에서는 실제 HWP COM 브릿지, 그 외에서는 Mock
  const hwpAdapter = process.platform === 'win32'
    ? new Win32HwpAdapter()
    : new MockHwpAdapter()
  const hwpService = new HwpService(hwpAdapter)

  // ── Initialize AI service ─────────────────────────────────

  const aiService = new AiService()

  // Restore saved API key and provider
  const savedKey = settings.get('apiKey')
  const savedProvider = settings.get('aiProvider') as 'claude' | 'openai' | null
  if (savedKey && savedProvider) {
    aiService.setApiKey(savedProvider, savedKey)
  }

  // Restore saved model
  const savedModel = settings.get('model')
  if (savedModel) {
    aiService.setModel(savedModel)
  }

  // ── Create main window ────────────────────────────────────

  mainWindow = createWindow()

  // ── Register IPC handlers ─────────────────────────────────

  registerIpcHandlers({
    mainWindow,
    hwpService,
    aiService,
    sessions,
    messages,
    editHistory,
    settings
  })

  // ── Start HWP status polling ──────────────────────────────

  hwpService.startPolling(DEFAULTS.HWP_POLL_INTERVAL, (status) => {
    mainWindow?.webContents.send(IPC.HWP_STATUS_CHANGED, status)
  })

  // Re-create window on macOS when dock icon is clicked and no windows are open
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  app.quit()
})
