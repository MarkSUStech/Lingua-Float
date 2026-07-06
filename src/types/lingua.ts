export type TranslateMode = 'word' | 'sentence'

export type RuntimePlatform = 'web' | 'windows' | 'android'

export type TranslationSettings = {
  apiKey: string
  endpoint: string
  model: string
  targetLanguage: string
  sourceLanguage: string
  temperature: number
  autoTranslateHotkey: string
  autoTranslateEnabled: boolean
}

export type WordLookup = {
  word: string
  normalized: string
  phonetic?: string
  partOfSpeech?: string
  translation: string
  definition?: string
  collins?: number
  oxford?: boolean
  tags?: string
  examples?: string[]
  source: 'local' | 'ecdict'
}

export type SentenceTranslation = {
  text: string
  translation: string
  brief?: string
  source: 'api' | 'fallback'
}

export type TranslationResult =
  | {
      mode: 'word'
      input: string
      lookup: WordLookup
    }
  | {
      mode: 'sentence'
      input: string
      result: SentenceTranslation
    }
  | {
      mode: 'empty'
      input: string
    }
  | {
      mode: 'missing-key'
      input: string
      message: string
    }
  | {
      mode: 'not-found'
      input: string
      message: string
    }
  | {
      mode: 'error'
      input: string
      message: string
    }

export type SelectionPayload = {
  text: string
  platform: RuntimePlatform
  anchor?: {
    x: number
    y: number
  }
  origin?:
    | 'hotkey'
    | 'watcher'
    | 'process-text'
    | 'manual'
    | 'launch'
    | 'second-instance'
    | 'tray'
}

export type WatchState = {
  enabled: boolean
  hotkey: string
  ok?: boolean
}

export type PackedDictionaryEntry = [
  string,
  string,
  string,
  string,
  string,
  number,
  number,
  string,
  string,
]

export type LinguaBridge = {
  platform: RuntimePlatform
  onSelectionText: (handler: (payload: SelectionPayload) => void) => () => void
  translateLong: (
    text: string,
    settings: TranslationSettings,
  ) => Promise<SentenceTranslation>
  loadSettings: () => Promise<Partial<TranslationSettings>>
  saveSettings: (settings: TranslationSettings) => Promise<void>
  lookupWord: (candidates: string[]) => Promise<PackedDictionaryEntry | null>
  getWatchState: () => Promise<WatchState>
  setWatchEnabled: (enabled: boolean) => Promise<WatchState>
  setWatchHotkey: (hotkey: string) => Promise<WatchState>
  onWatchState: (handler: (state: WatchState) => void) => () => void
  copy: (text: string) => Promise<void>
  hideWindow: () => void
  resize: (size: { width: number; height: number }) => void
}

declare global {
  interface Window {
    linguaFloat?: LinguaBridge
  }
}
