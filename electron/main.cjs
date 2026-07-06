const {
  app,
  BrowserWindow,
  clipboard,
  globalShortcut,
  ipcMain,
  Menu,
  nativeImage,
  screen,
  Tray,
} = require('electron')
const { execFile, spawn } = require('node:child_process')
const fs = require('node:fs/promises')
const path = require('node:path')

const isDev = process.argv.includes('--dev')
const DEFAULT_TOGGLE_HOTKEY = 'CommandOrControl+Alt+T'
const DEFAULT_WIDTH = 390
const DEFAULT_HEIGHT = 270

let popupWindow = null
let tray = null
let isQuitting = false
let toggleHotkey = DEFAULT_TOGGLE_HOTKEY
let watchEnabled = false
let selectionWatcher = null
let captureInFlight = false
let outsideClickWatcherEnabled = false
const gotSingleInstanceLock = app.requestSingleInstanceLock()

const settingsPath = () => path.join(app.getPath('userData'), 'settings.json')

const trayIconPath = () => {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'build', 'lingua-float-icon.ico')
  }
  return path.join(__dirname, '..', 'build', 'lingua-float-icon.ico')
}

const readSettings = async () => {
  try {
    const raw = await fs.readFile(settingsPath(), 'utf8')
    try {
      return JSON.parse(raw)
    } catch {
      return repairSettings(raw)
    }
  } catch {
    return {}
  }
}

const repairSettings = (raw) => {
  const stringValue = (key) => {
    const match = raw.match(new RegExp(`"${key}"\\s*:\\s*"([^"]*)"`))
    return match?.[1] || ''
  }

  const numberValue = (key, fallback) => {
    const match = raw.match(new RegExp(`"${key}"\\s*:\\s*([0-9.]+)`))
    return match ? Number(match[1]) : fallback
  }

  const booleanValue = (key, fallback) => {
    const match = raw.match(new RegExp(`"${key}"\\s*:\\s*(true|false)`))
    return match ? match[1] === 'true' : fallback
  }

  return {
    apiKey: stringValue('apiKey'),
    endpoint: stringValue('endpoint') || 'https://api.openai.com/v1/chat/completions',
    model: stringValue('model') || 'gpt-4.1-mini',
    targetLanguage: stringValue('targetLanguage') || '简体中文',
    sourceLanguage: stringValue('sourceLanguage') || 'auto',
    temperature: numberValue('temperature', 0.1),
    autoTranslateHotkey: stringValue('autoTranslateHotkey') || DEFAULT_TOGGLE_HOTKEY,
    autoTranslateEnabled: booleanValue('autoTranslateEnabled', false),
  }
}

const writeSettings = async (settings) => {
  await fs.mkdir(app.getPath('userData'), { recursive: true })
  await fs.writeFile(settingsPath(), JSON.stringify(settings, null, 2), 'utf8')
}

const readAppSettings = async () => {
  const settings = await readSettings()
  return {
    ...settings,
    endpoint: normalizeChatEndpoint(settings.endpoint || 'https://api.openai.com/v1/chat/completions'),
    model: settings.model || 'gpt-4.1-mini',
    targetLanguage: settings.targetLanguage || '简体中文',
    sourceLanguage: settings.sourceLanguage || 'auto',
    temperature: Number.isFinite(Number(settings.temperature)) ? Number(settings.temperature) : 0.1,
    autoTranslateHotkey: settings.autoTranslateHotkey || DEFAULT_TOGGLE_HOTKEY,
    autoTranslateEnabled: Boolean(settings.autoTranslateEnabled),
  }
}

const normalizeChatEndpoint = (endpoint) => {
  const clean = String(endpoint || '').trim().replace(/\/+$/, '')
  if (!clean) return 'https://api.openai.com/v1/chat/completions'

  try {
    const url = new URL(clean)
    const route = url.pathname.replace(/\/+$/, '')
    if (route.endsWith('/chat/completions')) return url.toString()

    if (url.hostname === 'api.deepseek.com') {
      url.pathname = `${route}/chat/completions`.replace(/\/+/g, '/')
      return url.toString()
    }

    if (route === '' || route === '/') {
      url.pathname = '/v1/chat/completions'
      return url.toString()
    }

    if (route.endsWith('/v1')) {
      url.pathname = `${route}/chat/completions`
      return url.toString()
    }
  } catch {
    return clean
  }

  return clean
}

const dictRoot = () =>
  isDev
    ? path.join(__dirname, '..', 'public', 'dict')
    : path.join(__dirname, '..', 'dist', 'dict')

const dictBucketCache = new Map()
const dictFormCache = new Map()

const normalizeDictWord = (word) =>
  String(word || '')
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')

const dictBucketOf = (word) => {
  const match = normalizeDictWord(word).match(/[a-z]/)
  return match ? match[0] : '_'
}

const readJsonSafe = async (file) => {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'))
  } catch {
    return {}
  }
}

const loadDictBucket = async (bucket) => {
  if (!dictBucketCache.has(bucket)) {
    dictBucketCache.set(
      bucket,
      readJsonSafe(path.join(dictRoot(), 'buckets', `${bucket}.json`)),
    )
  }
  return dictBucketCache.get(bucket)
}

const loadFormBucket = async (bucket) => {
  if (!dictFormCache.has(bucket)) {
    dictFormCache.set(
      bucket,
      readJsonSafe(path.join(dictRoot(), 'forms', `${bucket}.json`)),
    )
  }
  return dictFormCache.get(bucket)
}

const lookupPackedWord = async (word) => {
  const key = normalizeDictWord(word)
  if (!key) return null
  const bucket = await loadDictBucket(dictBucketOf(key))
  return bucket[key] || null
}

const lookupDictionaryWord = async (candidates) => {
  const cleanCandidates = [...new Set((candidates || []).map(normalizeDictWord).filter(Boolean))]

  for (const candidate of cleanCandidates) {
    const exact = await lookupPackedWord(candidate)
    if (exact) return exact
  }

  for (const candidate of cleanCandidates) {
    const forms = await loadFormBucket(dictBucketOf(candidate))
    const lemmas = forms[candidate] || []
    for (const lemma of lemmas) {
      const found = await lookupPackedWord(lemma)
      if (found) return found
    }
  }

  return null
}

const createWindow = async () => {
  popupWindow = new BrowserWindow({
    width: DEFAULT_WIDTH,
    height: DEFAULT_HEIGHT,
    minWidth: 320,
    minHeight: 220,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    autoHideMenuBar: true,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  popupWindow.setAlwaysOnTop(true, 'floating')
  popupWindow.on('close', (event) => {
    if (isQuitting) return
    event.preventDefault()
    hidePopupWindow()
  })

  if (isDev) {
    await popupWindow.loadURL('http://127.0.0.1:5173')
  } else {
    await popupWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }
}

const updateTrayMenu = () => {
  if (!tray) return

  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: '打开设置',
        click: () => showLauncherWindow('tray'),
      },
      {
        label: watchEnabled ? '关闭划词翻译' : '开启划词翻译',
        click: () => {
          toggleWatchEnabled()
          updateTrayMenu()
        },
      },
      { type: 'separator' },
      {
        label: '退出',
        click: () => {
          isQuitting = true
          app.quit()
        },
      },
    ]),
  )
}

const createTray = () => {
  if (tray) return

  const icon = nativeImage.createFromPath(trayIconPath()).resize({
    width: 16,
    height: 16,
  })
  tray = new Tray(icon)
  tray.setToolTip(`Lingua Float - ${watchEnabled ? '划词翻译已开启' : '划词翻译已关闭'}`)
  tray.on('click', () => showLauncherWindow('tray'))
  tray.on('double-click', () => showLauncherWindow('tray'))
  updateTrayMenu()
}

const sendCopyShortcut = () =>
  new Promise((resolve) => {
    const script = [
      '$shell = New-Object -ComObject WScript.Shell',
      'Start-Sleep -Milliseconds 30',
      "$shell.SendKeys('^c')",
    ].join('; ')

    execFile(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { windowsHide: true, timeout: 1000 },
      () => setTimeout(resolve, 120),
    )
  })

const moveNearCursor = (width = DEFAULT_WIDTH, height = DEFAULT_HEIGHT) => {
  const point = screen.getCursorScreenPoint()
  const display = screen.getDisplayNearestPoint(point).workArea
  const x = Math.min(Math.max(point.x + 14, display.x + 8), display.x + display.width - width - 8)
  const y = Math.min(Math.max(point.y + 18, display.y + 8), display.y + display.height - height - 8)
  popupWindow.setBounds({ x, y, width, height })
  return {
    x,
    y,
    width,
    height,
    anchor: {
      x: point.x - x,
      y: point.y - y,
    },
  }
}

const showSelection = (text, origin = 'hotkey') => {
  if (!popupWindow || popupWindow.isDestroyed()) return

  const bounds = moveNearCursor()
  popupWindow.webContents.send('selection-text', {
    text,
    platform: 'windows',
    origin,
    anchor: bounds.anchor,
  })
  popupWindow.showInactive()
  startOutsideClickWatcher()
}

const showLauncherWindow = (origin = 'launch') => {
  if (!popupWindow || popupWindow.isDestroyed()) return

  const bounds = moveNearCursor()
  popupWindow.webContents.send('selection-text', {
    text: '',
    platform: 'windows',
    origin,
    anchor: bounds.anchor,
  })
  if (popupWindow.isMinimized()) popupWindow.restore()
  popupWindow.show()
  popupWindow.focus()
  startOutsideClickWatcher()
}

const pointInWindow = (x, y) => {
  if (!popupWindow || popupWindow.isDestroyed() || !popupWindow.isVisible()) return false
  const bounds = popupWindow.getBounds()
  return x >= bounds.x && x <= bounds.x + bounds.width && y >= bounds.y && y <= bounds.y + bounds.height
}

const hideIfClickOutside = (x, y) => {
  if (!popupWindow || popupWindow.isDestroyed() || !popupWindow.isVisible()) return
  if (!pointInWindow(x, y)) hidePopupWindow()
}

const hidePopupWindow = () => {
  if (!popupWindow || popupWindow.isDestroyed()) return
  popupWindow.hide()
  outsideClickWatcherEnabled = false
  if (!watchEnabled) stopSelectionWatcher()
}

const notifyWatchState = () => {
  if (!popupWindow || popupWindow.isDestroyed()) return

  popupWindow.webContents.send('watch-state', {
    enabled: watchEnabled,
    hotkey: toggleHotkey,
  })
  if (tray) {
    tray.setToolTip(`Lingua Float - ${watchEnabled ? '划词翻译已开启' : '划词翻译已关闭'}`)
    updateTrayMenu()
  }
}

const captureSelectedText = async ({
  origin = 'hotkey',
  showIfEmpty = true,
  requireClipboardChange = false,
} = {}) => {
  if (captureInFlight) return
  captureInFlight = true

  const before = clipboard.readText()
  await sendCopyShortcut()
  const selected = clipboard.readText().trim()
  captureInFlight = false

  if (before && selected && selected !== before) {
    setTimeout(() => clipboard.writeText(before), 250)
  }

  if (requireClipboardChange && selected === before) {
    return
  }

  if (selected) {
    showSelection(selected, origin)
  } else if (showIfEmpty) {
    showLauncherWindow(origin)
  }
}

const selectionWatcherScript = `
$ErrorActionPreference = 'SilentlyContinue'
Add-Type @"
using System;
using System.Runtime.InteropServices;
public struct POINT { public int X; public int Y; }
public static class User32 {
  [DllImport("user32.dll")] public static extern short GetAsyncKeyState(int vKey);
  [DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT lpPoint);
}
"@
$wasDown = $false
$startX = 0
$startY = 0
$startAt = Get-Date
$startedWithCtrl = $false
while ($true) {
  $down = ([User32]::GetAsyncKeyState(0x01) -band 0x8000) -ne 0
  $ctrlDown = (([User32]::GetAsyncKeyState(0x11) -band 0x8000) -ne 0) -or (([User32]::GetAsyncKeyState(0xA2) -band 0x8000) -ne 0) -or (([User32]::GetAsyncKeyState(0xA3) -band 0x8000) -ne 0)
  $point = New-Object POINT
  [User32]::GetCursorPos([ref]$point) | Out-Null
  if ($down -and -not $wasDown) {
    $startX = $point.X
    $startY = $point.Y
    $startAt = Get-Date
    $startedWithCtrl = $ctrlDown
  }
  if ($wasDown -and -not $down) {
    $dx = [Math]::Abs($point.X - $startX)
    $dy = [Math]::Abs($point.Y - $startY)
    $duration = ((Get-Date) - $startAt).TotalMilliseconds
    if (($dx -gt 8 -or $dy -gt 8) -and $duration -gt 90 -and ($startedWithCtrl -or $ctrlDown)) {
      Write-Output "select $($point.X) $($point.Y)"
      [Console]::Out.Flush()
      Start-Sleep -Milliseconds 160
    } elseif ($duration -gt 30) {
      Write-Output "click $($point.X) $($point.Y)"
      [Console]::Out.Flush()
    }
  }
  $wasDown = $down
  Start-Sleep -Milliseconds 24
}
`

const startSelectionWatcher = () => {
  if (selectionWatcher) return

  selectionWatcher = spawn(
    'powershell.exe',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', selectionWatcherScript],
    {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore'],
    },
  )

  selectionWatcher.stdout.setEncoding('utf8')
  selectionWatcher.stdout.on('data', (chunk) => {
    for (const line of chunk.split(/\r?\n/)) {
      const parts = line.trim().split(/\s+/)
      if (parts[0] === 'click') {
        hideIfClickOutside(Number(parts[1]), Number(parts[2]))
      }

      if (parts[0] === 'select') {
        captureSelectedText({
          origin: 'watcher',
          showIfEmpty: false,
          requireClipboardChange: true,
        })
      }
    }
  })

  selectionWatcher.on('exit', () => {
    selectionWatcher = null
    if (watchEnabled) {
      watchEnabled = false
      notifyWatchState()
    }
  })
}

const stopSelectionWatcher = () => {
  outsideClickWatcherEnabled = false
  if (!selectionWatcher) return
  selectionWatcher.kill()
  selectionWatcher = null
}

const startOutsideClickWatcher = () => {
  outsideClickWatcherEnabled = true
  startSelectionWatcher()
}

const setWatchEnabled = async (enabled) => {
  watchEnabled = Boolean(enabled)
  if (watchEnabled) startSelectionWatcher()
  else if (!outsideClickWatcherEnabled) stopSelectionWatcher()

  const settings = await readAppSettings()
  await writeSettings({
    ...settings,
    autoTranslateEnabled: watchEnabled,
    autoTranslateHotkey: toggleHotkey,
  })
  notifyWatchState()
  return { enabled: watchEnabled, hotkey: toggleHotkey }
}

const toggleWatchEnabled = () => {
  setWatchEnabled(!watchEnabled)
}

const registerToggleHotkey = async (accelerator) => {
  const nextHotkey = (accelerator || DEFAULT_TOGGLE_HOTKEY).trim()
  if (toggleHotkey) globalShortcut.unregister(toggleHotkey)

  const ok = globalShortcut.register(nextHotkey, toggleWatchEnabled)
  if (!ok) {
    globalShortcut.register(toggleHotkey || DEFAULT_TOGGLE_HOTKEY, toggleWatchEnabled)
    return { ok: false, enabled: watchEnabled, hotkey: toggleHotkey }
  }

  toggleHotkey = nextHotkey
  const settings = await readAppSettings()
  await writeSettings({
    ...settings,
    autoTranslateHotkey: toggleHotkey,
    autoTranslateEnabled: watchEnabled,
  })
  notifyWatchState()
  return { ok: true, enabled: watchEnabled, hotkey: toggleHotkey }
}

const translateLong = async (text, settings) => {
  if (!settings.apiKey) {
    throw new Error('missing_api_key')
  }

  const response = await fetch(normalizeChatEndpoint(settings.endpoint), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${settings.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: settings.model,
      messages: [
        {
          role: 'system',
          content:
            'You are a fast translation engine. Return only compact JSON with keys translation and brief. Keep names, code, numbers, and units faithful. No markdown.',
        },
        {
          role: 'user',
          content: `Translate to ${settings.targetLanguage}. Source language: ${settings.sourceLanguage}. Text: ${text}`,
        },
      ],
      temperature: settings.temperature,
    }),
  })

  const raw = await response.text()
  const data = raw
    ? (() => {
        try {
          return JSON.parse(raw)
        } catch {
          return null
        }
      })()
    : null

  if (!response.ok) {
    throw new Error(data?.error?.message || raw || `HTTP ${response.status}`)
  }

  if (!data) {
    throw new Error('Translation API returned an empty or non-JSON response')
  }

  const content = data?.choices?.[0]?.message?.content?.trim()
  if (!content) throw new Error('empty_translation')

  try {
    const parsed = JSON.parse(content)
    return {
      text,
      translation: String(parsed.translation || '').trim(),
      brief: parsed.brief ? String(parsed.brief).trim() : undefined,
      source: 'api',
    }
  } catch {
    return {
      text,
      translation: content,
      source: 'api',
    }
  }
}

if (!gotSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    showLauncherWindow('second-instance')
  })

  app.whenReady().then(async () => {
    await createWindow()
    const settings = await readAppSettings()
    toggleHotkey = settings.autoTranslateHotkey
    watchEnabled = settings.autoTranslateEnabled
    createTray()

    globalShortcut.register(toggleHotkey, toggleWatchEnabled)
    if (watchEnabled) startSelectionWatcher()

    ipcMain.handle('settings:load', readAppSettings)
    ipcMain.handle('settings:save', (_event, settings) => writeSettings(settings))
    ipcMain.handle('translate:long', (_event, text, settings) => translateLong(text, settings))
    ipcMain.handle('dict:lookup-word', (_event, candidates) => lookupDictionaryWord(candidates))
    ipcMain.handle('watch:get-state', () => ({ enabled: watchEnabled, hotkey: toggleHotkey }))
    ipcMain.handle('watch:set-enabled', (_event, enabled) => setWatchEnabled(enabled))
    ipcMain.handle('watch:set-hotkey', (_event, hotkey) => registerToggleHotkey(hotkey))
    ipcMain.handle('clipboard:copy', (_event, text) => clipboard.writeText(text))
    ipcMain.on('window:hide', hidePopupWindow)
    ipcMain.on('window:resize', (_event, size) => {
      const width = Math.min(Math.max(Number(size.width) || DEFAULT_WIDTH, 320), 520)
      const height = Math.min(Math.max(Number(size.height) || DEFAULT_HEIGHT, 220), 520)
      moveNearCursor(width, height)
    })

    showLauncherWindow('launch')
  })
}

app.on('will-quit', () => {
  isQuitting = true
  stopSelectionWatcher()
  globalShortcut.unregisterAll()
})

app.on('window-all-closed', (event) => {
  event.preventDefault()
})
