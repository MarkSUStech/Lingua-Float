import { EMBEDDED_TRANSLATION_SETTINGS } from '@/config/embedded'
import type {
  SentenceTranslation,
  TranslationResult,
  TranslationSettings,
} from '@/types/lingua'
import { lookupLocalWord } from './localDictionary'
import { isProbablySingleWord, normalizeSelection } from './text'

const SETTINGS_KEY = 'lingua-float-settings'

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string
    }
  }>
  error?: {
    message?: string
  }
}

export const defaultSettings = (): TranslationSettings => ({
  ...EMBEDDED_TRANSLATION_SETTINGS,
})

export const loadLocalSettings = (): TranslationSettings => {
  const raw = localStorage.getItem(SETTINGS_KEY)
  if (!raw) return defaultSettings()

  try {
    return {
      ...defaultSettings(),
      ...(JSON.parse(raw) as Partial<TranslationSettings>),
    }
  } catch {
    return defaultSettings()
  }
}

export const saveLocalSettings = (settings: TranslationSettings) => {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
}

export const normalizeChatEndpoint = (endpoint: string): string => {
  const clean = endpoint.trim().replace(/\/+$/, '')
  if (!clean) return defaultSettings().endpoint

  try {
    const url = new URL(clean)
    const path = url.pathname.replace(/\/+$/, '')
    if (path.endsWith('/chat/completions')) return url.toString()

    if (url.hostname === 'api.deepseek.com') {
      url.pathname = `${path}/chat/completions`.replace(/\/+/g, '/')
      return url.toString()
    }

    if (path === '' || path === '/') {
      url.pathname = '/v1/chat/completions'
      return url.toString()
    }

    if (path.endsWith('/v1')) {
      url.pathname = `${path}/chat/completions`
      return url.toString()
    }
  } catch {
    return clean
  }

  return clean
}

const buildPrompt = (text: string, settings: TranslationSettings) => [
  {
    role: 'system',
    content:
      'You are a fast translation engine. Return only compact JSON with keys translation and brief. Keep names, code, numbers, and units faithful. No markdown.',
  },
  {
    role: 'user',
    content: `Translate to ${settings.targetLanguage}. Source language: ${settings.sourceLanguage}. Text: ${text}`,
  },
]

const parseModelContent = (content: string): Pick<
  SentenceTranslation,
  'translation' | 'brief'
> => {
  const trimmed = content.trim()

  try {
    const parsed = JSON.parse(trimmed) as {
      translation?: string
      brief?: string
    }
    if (parsed.translation) {
      return {
        translation: parsed.translation.trim(),
        brief: parsed.brief?.trim(),
      }
    }
  } catch {
    // Some compatible providers still return plain text. Use it directly.
  }

  return { translation: trimmed }
}

const parseApiResponse = (raw: string): ChatCompletionResponse | null => {
  if (!raw.trim()) return null

  try {
    return JSON.parse(raw) as ChatCompletionResponse
  } catch {
    return null
  }
}

export const translateWithApi = async (
  text: string,
  settings: TranslationSettings,
): Promise<SentenceTranslation> => {
  const input = normalizeSelection(text)
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
      messages: buildPrompt(input, settings),
      temperature: settings.temperature,
    }),
  })

  const raw = await response.text()
  const data = parseApiResponse(raw)

  if (!response.ok) {
    throw new Error(data?.error?.message || raw || `HTTP ${response.status}`)
  }

  if (!data) {
    throw new Error('Translation API returned an empty or non-JSON response')
  }

  const content = data.choices?.[0]?.message?.content
  if (!content) {
    throw new Error('empty_translation')
  }

  const parsed = parseModelContent(content)
  return {
    text: input,
    translation: parsed.translation,
    brief: parsed.brief,
    source: 'api',
  }
}

export const translateSentence = async (
  text: string,
  settings: TranslationSettings,
): Promise<SentenceTranslation> => {
  if (window.linguaFloat?.translateLong) {
    return window.linguaFloat.translateLong(text, settings)
  }

  return translateWithApi(text, settings)
}

export const translateSelection = async (
  text: string,
  settings: TranslationSettings,
): Promise<TranslationResult> => {
  const input = normalizeSelection(text)
  if (!input) return { mode: 'empty', input }

  if (isProbablySingleWord(input)) {
    const lookup = await lookupLocalWord(input)
    if (lookup) {
      return { mode: 'word', input, lookup }
    }

    return {
      mode: 'not-found',
      input,
      message: '本地词典暂未收录',
    }
  }

  if (!settings.apiKey) {
    return {
      mode: 'missing-key',
      input,
      message: '长句翻译需要配置 API key',
    }
  }

  try {
    const result = await translateSentence(input, settings)
    return { mode: 'sentence', input, result }
  } catch (error) {
    return {
      mode: 'error',
      input,
      message: error instanceof Error ? error.message : '翻译失败',
    }
  }
}
