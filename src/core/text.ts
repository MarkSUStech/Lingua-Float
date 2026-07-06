export const normalizeSelection = (value: string) =>
  value.replace(/\s+/g, ' ').trim()

export const isProbablySingleWord = (value: string) => {
  const text = normalizeSelection(value)
  if (!text) return false
  if (/[\u3400-\u9fff]/.test(text)) return text.length <= 4
  return /^[A-Za-z][A-Za-z'-]*$/.test(text)
}

export const compactPreview = (value: string, limit = 180) => {
  const text = normalizeSelection(value)
  return text.length > limit ? `${text.slice(0, limit - 1)}...` : text
}

export const normalizeLookupWord = (value: string) =>
  normalizeSelection(value).toLowerCase().replace(/^'+|'+$/g, '')

export const deriveLookupCandidates = (value: string) => {
  const word = normalizeLookupWord(value)
  const candidates = new Set([word])

  if (word.endsWith("'s")) candidates.add(word.slice(0, -2))
  if (word.endsWith('ies') && word.length > 4)
    candidates.add(`${word.slice(0, -3)}y`)
  if (word.endsWith('ing') && word.length > 5) {
    candidates.add(word.slice(0, -3))
    candidates.add(`${word.slice(0, -3)}e`)
  }
  if (word.endsWith('ed') && word.length > 4) {
    candidates.add(word.slice(0, -2))
    candidates.add(`${word.slice(0, -1)}`)
  }
  if (word.endsWith('s') && word.length > 3) candidates.add(word.slice(0, -1))

  return [...candidates].filter(Boolean)
}
