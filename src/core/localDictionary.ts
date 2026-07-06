import type { PackedDictionaryEntry, WordLookup } from '@/types/lingua'
import { deriveLookupCandidates, normalizeLookupWord } from './text'

type Bucket = Record<string, PackedDictionaryEntry>
type FormBucket = Record<string, string[]>

const bucketCache = new Map<string, Promise<Bucket>>()
const formCache = new Map<string, Promise<FormBucket>>()

const dictBaseUrl = () => `${import.meta.env.BASE_URL || './'}dict`

const bucketOf = (word: string) => {
  const first = normalizeLookupWord(word).match(/[a-z]/)?.[0]
  return first || '_'
}

const fetchJson = async <T>(url: string, fallback: T): Promise<T> => {
  try {
    const response = await fetch(url)
    if (!response.ok) return fallback
    return (await response.json()) as T
  } catch {
    return fallback
  }
}

const loadBucket = (bucket: string) => {
  if (!bucketCache.has(bucket)) {
    bucketCache.set(
      bucket,
      fetchJson<Bucket>(`${dictBaseUrl()}/buckets/${bucket}.json`, {}),
    )
  }
  return bucketCache.get(bucket)!
}

const loadFormBucket = (bucket: string) => {
  if (!formCache.has(bucket)) {
    formCache.set(
      bucket,
      fetchJson<FormBucket>(`${dictBaseUrl()}/forms/${bucket}.json`, {}),
    )
  }
  return formCache.get(bucket)!
}

const packedToLookup = (
  packed: PackedDictionaryEntry,
  input: string,
): WordLookup => ({
  word: packed[0] || input.trim(),
  normalized: normalizeLookupWord(packed[0] || input),
  phonetic: packed[1] || undefined,
  translation: (packed[2] || packed[3] || '').replace(/\\n/g, '\n'),
  definition: packed[3]?.replace(/\\n/g, '\n') || undefined,
  partOfSpeech: packed[4] || undefined,
  collins: packed[5] || undefined,
  oxford: Boolean(packed[6]),
  tags: packed[7] || undefined,
  source: 'ecdict',
})

const lookupPackedInBrowser = async (candidates: string[]) => {
  for (const candidate of candidates) {
    const bucket = await loadBucket(bucketOf(candidate))
    const packed = bucket[candidate]
    if (packed) return packed
  }

  for (const candidate of candidates) {
    const forms = await loadFormBucket(bucketOf(candidate))
    const lemmas = forms[candidate] || []
    for (const lemma of lemmas) {
      const bucket = await loadBucket(bucketOf(lemma))
      const packed = bucket[lemma]
      if (packed) return packed
    }
  }

  return null
}

export const lookupLocalWord = async (
  value: string,
): Promise<WordLookup | null> => {
  const normalized = normalizeLookupWord(value)

  if (/^[\u3400-\u9fff]{1,4}$/.test(normalized)) {
    return {
      word: value.trim(),
      normalized,
      translation: normalized,
      partOfSpeech: '中文',
      source: 'local',
    }
  }

  const candidates = [
    ...new Set(deriveLookupCandidates(value).map(normalizeLookupWord)),
  ].filter(Boolean)

  const packed = window.linguaFloat?.lookupWord
    ? await window.linguaFloat.lookupWord(candidates)
    : await lookupPackedInBrowser(candidates)

  return packed ? packedToLookup(packed, value) : null
}
