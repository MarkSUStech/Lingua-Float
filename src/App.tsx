import { type CSSProperties, useCallback, useEffect, useMemo, useState } from 'react'
import {
  Check,
  Copy,
  Keyboard,
  Languages,
  Loader2,
  Power,
  Settings,
  X,
} from 'lucide-react'
import './App.css'
import {
  defaultSettings,
  loadLocalSettings,
  saveLocalSettings,
  translateSelection,
} from '@/core/translator'
import { normalizeSelection } from '@/core/text'
import type {
  RuntimePlatform,
  SelectionPayload,
  TranslationResult,
  TranslationSettings,
  WatchState,
} from '@/types/lingua'

const emptyResult: TranslationResult = { mode: 'empty', input: '' }

const detectPlatform = (): RuntimePlatform => {
  if (window.linguaFloat?.platform) return window.linguaFloat.platform
  if (/Android/i.test(navigator.userAgent)) return 'android'
  return 'web'
}

const resultText = (result: TranslationResult) => {
  if (result.mode === 'word') return result.lookup.translation
  if (result.mode === 'sentence') return result.result.translation
  return ''
}

function App() {
  const [platform] = useState<RuntimePlatform>(() => detectPlatform())
  const [, setInput] = useState('')
  const [settings, setSettings] = useState<TranslationSettings>(() =>
    loadLocalSettings(),
  )
  const [hotkeyDraft, setHotkeyDraft] = useState(settings.autoTranslateHotkey)
  const [result, setResult] = useState<TranslationResult>(emptyResult)
  const [busy, setBusy] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(true)
  const [copied, setCopied] = useState(false)
  const [hotkeyError, setHotkeyError] = useState('')
  const [flowKey, setFlowKey] = useState(0)
  const [flowAnchor, setFlowAnchor] = useState({ x: 18, y: 18 })

  const output = useMemo(() => resultText(result), [result])

  const persistSettings = useCallback(async (next: TranslationSettings) => {
    setSettings(next)
    saveLocalSettings(next)
    await window.linguaFloat?.saveSettings(next)
  }, [])

  const mergeSettings = useCallback(
    (patch: Partial<TranslationSettings>) => {
      const next = { ...settings, ...patch }
      void persistSettings(next)
      return next
    },
    [persistSettings, settings],
  )

  const applyWatchState = useCallback(
    (state: WatchState) => {
      setHotkeyError(state.ok === false ? 'Hotkey unavailable' : '')
      setHotkeyDraft(state.hotkey)
      mergeSettings({
        autoTranslateEnabled: state.enabled,
        autoTranslateHotkey: state.hotkey,
      })
    },
    [mergeSettings],
  )

  const runTranslation = useCallback(
    async (value: string) => {
      const text = normalizeSelection(value)
      setInput(text)
      setCopied(false)

      if (!text) {
        setResult(emptyResult)
        return
      }

      setSettingsOpen(false)
      setBusy(true)
      const next = await translateSelection(text, settings)
      setResult(next)
      setBusy(false)
    },
    [settings],
  )

  useEffect(() => {
    window.linguaFloat?.loadSettings().then((remote) => {
      const next = {
        ...defaultSettings(),
        ...loadLocalSettings(),
        ...remote,
      }
      setSettings(next)
      setHotkeyDraft(next.autoTranslateHotkey)
    })

    window.linguaFloat?.getWatchState().then((state) => {
      setHotkeyDraft(state.hotkey)
      setSettings((current) => ({
        ...current,
        autoTranslateEnabled: state.enabled,
        autoTranslateHotkey: state.hotkey,
      }))
    })
  }, [])

  useEffect(() => {
    const bridgeCleanup = window.linguaFloat?.onSelectionText(
      (payload: SelectionPayload) => {
        setFlowKey((current) => current + 1)
        setFlowAnchor(payload.anchor || { x: 18, y: 18 })

        if (payload.origin === 'launch' || payload.origin === 'second-instance') {
          setInput('')
          setResult(emptyResult)
          setSettingsOpen(true)
          return
        }

        if (payload.text) {
          void runTranslation(payload.text)
        }
      },
    )

    const watchCleanup = window.linguaFloat?.onWatchState((state) => {
      applyWatchState(state)
    })

    const androidHandler = (event: Event) => {
      const payload = (event as CustomEvent<{ text?: string }>).detail
      if (payload?.text) void runTranslation(payload.text)
    }

    window.addEventListener('android-process-text', androidHandler)
    return () => {
      bridgeCleanup?.()
      watchCleanup?.()
      window.removeEventListener('android-process-text', androidHandler)
    }
  }, [applyWatchState, runTranslation])

  useEffect(() => {
    const height = settingsOpen
      ? 520
      : result.mode === 'sentence'
        ? 360
        : result.mode === 'word'
          ? 320
          : 190
    window.linguaFloat?.resize({ width: 420, height })
  }, [result.mode, settingsOpen])

  const handleCopy = async () => {
    if (!output) return
    if (window.linguaFloat?.copy) {
      await window.linguaFloat.copy(output)
    } else {
      await navigator.clipboard.writeText(output)
    }
    setCopied(true)
    window.setTimeout(() => setCopied(false), 900)
  }

  const handleSettingsChange = (
    key: keyof TranslationSettings,
    value: string | number | boolean,
  ) => {
    mergeSettings({ [key]: value } as Partial<TranslationSettings>)
  }

  const toggleWatch = async () => {
    if (!window.linguaFloat?.setWatchEnabled) {
      handleSettingsChange(
        'autoTranslateEnabled',
        !settings.autoTranslateEnabled,
      )
      return
    }

    const state = await window.linguaFloat.setWatchEnabled(
      !settings.autoTranslateEnabled,
    )
    applyWatchState(state)
  }

  const commitHotkey = async () => {
    const hotkey = hotkeyDraft.trim() || defaultSettings().autoTranslateHotkey
    if (!window.linguaFloat?.setWatchHotkey) {
      handleSettingsChange('autoTranslateHotkey', hotkey)
      return
    }

    const state = await window.linguaFloat.setWatchHotkey(hotkey)
    applyWatchState(state)
  }

  const platformText =
    platform === 'windows' ? 'Windows' : platform === 'android' ? 'Android' : 'Web'
  const flowStyle = {
    '--flow-x': `${flowAnchor.x}px`,
    '--flow-y': `${flowAnchor.y}px`,
  } as CSSProperties

  return (
    <main key={flowKey} className="app-shell" style={flowStyle}>
      <header className="toolbar">
        <div className="brand">
          <Languages size={18} strokeWidth={2.1} />
          <span>Lingua Float</span>
          <small>{platformText}</small>
        </div>
        <div className="toolbar-actions">
          <button
            className="icon-button"
            type="button"
            title="Settings"
            aria-label="Settings"
            onClick={() => setSettingsOpen(true)}
          >
            <Settings size={16} />
          </button>
          <button
            className="icon-button"
            type="button"
            title="Hide"
            aria-label="Hide"
            onClick={() => window.linguaFloat?.hideWindow()}
          >
            <X size={17} />
          </button>
        </div>
      </header>

      {settingsOpen ? (
        <section className="settings-panel" aria-label="Settings">
          <div className="status-row">
            <div>
              <strong>Selection watcher</strong>
              <span>{settings.autoTranslateEnabled ? 'Enabled' : 'Disabled'}</span>
            </div>
            <button
              className={`power-button ${settings.autoTranslateEnabled ? 'is-on' : ''}`}
              type="button"
              title="Toggle watcher"
              aria-label="Toggle watcher"
              onClick={() => void toggleWatch()}
            >
              <Power size={17} />
            </button>
          </div>

          <label>
            <span>Toggle hotkey</span>
            <div className="input-with-icon">
              <Keyboard size={15} />
              <input
                value={hotkeyDraft}
                spellCheck={false}
                onBlur={() => void commitHotkey()}
                onChange={(event) => setHotkeyDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.currentTarget.blur()
                  }
                }}
              />
            </div>
            {hotkeyError ? <em>{hotkeyError}</em> : null}
          </label>

          <label>
            <span>API key</span>
            <input
              value={settings.apiKey}
              type="password"
              spellCheck={false}
              onChange={(event) =>
                handleSettingsChange('apiKey', event.target.value)
              }
            />
          </label>
          <label>
            <span>Endpoint</span>
            <input
              value={settings.endpoint}
              spellCheck={false}
              onChange={(event) =>
                handleSettingsChange('endpoint', event.target.value)
              }
            />
          </label>
          <div className="settings-row">
            <label>
              <span>Model</span>
              <input
                value={settings.model}
                spellCheck={false}
                onChange={(event) =>
                  handleSettingsChange('model', event.target.value)
                }
              />
            </label>
            <label>
              <span>Target</span>
              <input
                value={settings.targetLanguage}
                onChange={(event) =>
                  handleSettingsChange('targetLanguage', event.target.value)
                }
              />
            </label>
          </div>
          <label>
            <span>Temperature</span>
            <input
              value={settings.temperature}
              type="number"
              min="0"
              max="1"
              step="0.1"
              onChange={(event) =>
                handleSettingsChange('temperature', Number(event.target.value))
              }
            />
          </label>
        </section>
      ) : (
        <section className="result-zone" aria-live="polite">
          {busy ? (
            <div className="state-line">
              <Loader2 className="spin" size={17} />
              <span>Translating</span>
            </div>
          ) : (
            <ResultView
              result={result}
              onOpenSettings={() => setSettingsOpen(true)}
            />
          )}
        </section>
      )}

      {!settingsOpen && output ? (
        <button
          className="copy-fab"
          type="button"
          title="Copy"
          aria-label="Copy"
          onClick={() => void handleCopy()}
        >
          {copied ? <Check size={15} /> : <Copy size={15} />}
        </button>
      ) : null}
    </main>
  )
}

function ResultView({
  result,
  onOpenSettings,
}: {
  result: TranslationResult
  onOpenSettings: () => void
}) {
  if (result.mode === 'empty') {
    return <div className="quiet-state">No text</div>
  }

  if (result.mode === 'word') {
    return (
      <div className="word-result">
        <div className="word-line">
          <strong>{result.lookup.word}</strong>
          {result.lookup.phonetic ? (
            <code>/{result.lookup.phonetic}/</code>
          ) : null}
          {result.lookup.partOfSpeech ? (
            <span>{result.lookup.partOfSpeech}</span>
          ) : null}
        </div>
        {result.lookup.collins || result.lookup.oxford ? (
          <div className="dict-badges">
            {result.lookup.collins ? <span>Collins {result.lookup.collins}</span> : null}
            {result.lookup.oxford ? <span>Oxford</span> : null}
          </div>
        ) : null}
        <p>{result.lookup.translation}</p>
        {result.lookup.definition ? (
          <small>{result.lookup.definition}</small>
        ) : null}
      </div>
    )
  }

  if (result.mode === 'sentence') {
    return (
      <div className="sentence-result">
        <p>{result.result.translation}</p>
        {result.result.brief ? <small>{result.result.brief}</small> : null}
      </div>
    )
  }

  if (result.mode === 'missing-key') {
    return (
      <div className="message-result">
        <p>{result.message}</p>
        <button className="text-button primary" type="button" onClick={onOpenSettings}>
          <Settings size={15} />
          <span>Settings</span>
        </button>
      </div>
    )
  }

  return (
    <div className="message-result">
      <p>{result.message}</p>
    </div>
  )
}

export default App
