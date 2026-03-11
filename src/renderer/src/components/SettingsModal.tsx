import { useState, useEffect, useCallback } from 'react'
import { useAppStore } from '../stores/app-store'
import type { AppSettings } from '../../../shared/types'
import { DEFAULTS } from '../../../shared/constants'

const MODELS = {
  claude: [
    { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
    { value: 'claude-opus-4-20250514', label: 'Claude Opus 4' },
    { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5' }
  ],
  openai: [
    { value: 'gpt-4o', label: 'GPT-4o' },
    { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
    { value: 'gpt-4.1', label: 'GPT-4.1' },
    { value: 'gpt-4.1-mini', label: 'GPT-4.1 Mini' },
    { value: 'o3-mini', label: 'o3-mini' }
  ]
}

export function SettingsModal() {
  const setShowSettings = useAppStore((s) => s.setShowSettings)

  const [provider, setProvider] = useState<AppSettings['aiProvider']>(DEFAULTS.AI_PROVIDER)
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState<string>(DEFAULTS.MODEL)
  const [windowRatio, setWindowRatio] = useState<number>(DEFAULTS.WINDOW_RATIO)
  const [showKey, setShowKey] = useState(false)
  const [validationResult, setValidationResult] = useState<{ valid: boolean; error?: string } | null>(null)
  const [isValidating, setIsValidating] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  // Load current settings
  useEffect(() => {
    window.api.settings.get().then((settings) => {
      if (settings.aiProvider) setProvider(settings.aiProvider)
      if (settings.apiKey) setApiKey(settings.apiKey)
      if (settings.model) setModel(settings.model)
      if (settings.windowRatio != null) setWindowRatio(settings.windowRatio)
    })
  }, [])

  // Reset model when provider changes
  useEffect(() => {
    const models = MODELS[provider]
    if (models && !models.some((m) => m.value === model)) {
      setModel(models[0].value)
    }
  }, [provider, model])

  const handleValidateKey = useCallback(async () => {
    setIsValidating(true)
    setValidationResult(null)
    try {
      const result = await window.api.settings.validateKey(provider, apiKey)
      setValidationResult(result)
    } catch {
      setValidationResult({ valid: false, error: '검증 중 오류가 발생했습니다' })
    } finally {
      setIsValidating(false)
    }
  }, [provider, apiKey])

  const handleSave = useCallback(async () => {
    setIsSaving(true)
    try {
      await window.api.settings.set('aiProvider', provider)
      await window.api.settings.set('apiKey', apiKey)
      await window.api.settings.set('model', model)
      await window.api.settings.set('windowRatio', String(windowRatio))
      setShowSettings(false)
    } catch {
      // Error handled silently
    } finally {
      setIsSaving(false)
    }
  }, [provider, apiKey, model, windowRatio, setShowSettings])

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) {
        setShowSettings(false)
      }
    },
    [setShowSettings]
  )

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={handleBackdropClick}
    >
      <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-gray-900">
        {/* Close button */}
        <button
          onClick={() => setShowSettings(false)}
          className="absolute right-4 top-4 rounded-lg p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300"
        >
          <svg
            width="18"
            height="18"
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

        {/* Title */}
        <h2 className="mb-6 text-lg font-semibold text-gray-900 dark:text-gray-100">
          설정
        </h2>

        <div className="flex flex-col gap-5">
          {/* AI Provider */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-700 dark:text-gray-300">
              AI 제공자
            </label>
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value as AppSettings['aiProvider'])}
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 outline-none transition-colors focus:border-primary dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
            >
              <option value="claude">Claude (Anthropic)</option>
              <option value="openai">OpenAI</option>
            </select>
          </div>

          {/* API Key */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-700 dark:text-gray-300">
              API 키
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => {
                    setApiKey(e.target.value)
                    setValidationResult(null)
                  }}
                  placeholder={
                    provider === 'claude' ? 'sk-ant-...' : 'sk-...'
                  }
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 pr-10 text-sm text-gray-800 outline-none transition-colors focus:border-primary dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
                />
                <button
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  type="button"
                >
                  {showKey ? (
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
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
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
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
              <button
                onClick={handleValidateKey}
                disabled={!apiKey.trim() || isValidating}
                className="flex-shrink-0 rounded-lg bg-gray-100 px-3 py-2 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-200 disabled:opacity-40 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                {isValidating ? '검증 중...' : '키 검증'}
              </button>
            </div>
            {validationResult && (
              <p
                className={`mt-1.5 text-xs ${
                  validationResult.valid
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-red-500 dark:text-red-400'
                }`}
              >
                {validationResult.valid
                  ? '유효한 API 키입니다'
                  : validationResult.error || '유효하지 않은 API 키입니다'}
              </p>
            )}
          </div>

          {/* Model */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-700 dark:text-gray-300">
              모델
            </label>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 outline-none transition-colors focus:border-primary dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
            >
              {MODELS[provider].map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>

          {/* Window Ratio */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-700 dark:text-gray-300">
              창 비율
            </label>
            <div className="flex items-center gap-3">
              <span className="w-8 text-xs text-gray-400">HWP</span>
              <input
                type="range"
                min="0.3"
                max="0.7"
                step="0.05"
                value={windowRatio}
                onChange={(e) => setWindowRatio(parseFloat(e.target.value))}
                className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-gray-200 accent-primary dark:bg-gray-700"
              />
              <span className="w-8 text-right text-xs text-gray-400">AI</span>
            </div>
            <p className="mt-1 text-center text-[10px] text-gray-400">
              {Math.round((1 - windowRatio) * 100)}% : {Math.round(windowRatio * 100)}%
            </p>
          </div>
        </div>

        {/* Save button */}
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="mt-6 w-full rounded-xl bg-primary py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-hover disabled:opacity-50"
        >
          {isSaving ? '저장 중...' : '저장'}
        </button>
      </div>
    </div>
  )
}
