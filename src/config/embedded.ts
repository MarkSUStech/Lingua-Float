import type { TranslationSettings } from '@/types/lingua'

export const EMBEDDED_TRANSLATION_SETTINGS: TranslationSettings = {
  apiKey: import.meta.env.VITE_TRANSLATE_API_KEY || '',
  endpoint:
    import.meta.env.VITE_TRANSLATE_ENDPOINT ||
    'https://api.openai.com/v1/chat/completions',
  model: import.meta.env.VITE_TRANSLATE_MODEL || 'gpt-4.1-mini',
  targetLanguage: import.meta.env.VITE_TRANSLATE_TARGET || '简体中文',
  sourceLanguage: import.meta.env.VITE_TRANSLATE_SOURCE || 'auto',
  temperature: Number(import.meta.env.VITE_TRANSLATE_TEMPERATURE || 0.1),
  autoTranslateHotkey:
    import.meta.env.VITE_AUTO_TRANSLATE_HOTKEY || 'CommandOrControl+Alt+T',
  autoTranslateEnabled: false,
}
