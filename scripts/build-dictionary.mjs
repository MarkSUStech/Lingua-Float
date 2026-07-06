import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const csvPath = path.join(root, 'data', 'ecdict.csv')
const lemmaPath = path.join(root, 'data', 'lemma.en.txt')
const outRoot = path.join(root, 'public', 'dict')
const bucketRoot = path.join(outRoot, 'buckets')
const formRoot = path.join(outRoot, 'forms')

const bucketOf = (word) => {
  const first = word.toLowerCase().match(/[a-z]/)?.[0]
  return first || '_'
}

const normalizeWord = (word) =>
  word
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')

const ensureDir = (dir) => {
  fs.mkdirSync(dir, { recursive: true })
}

const parseCsv = (input, onRow) => {
  let field = ''
  let row = []
  let quoted = false

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index]

    if (quoted) {
      if (char === '"') {
        if (input[index + 1] === '"') {
          field += '"'
          index += 1
        } else {
          quoted = false
        }
      } else {
        field += char
      }
      continue
    }

    if (char === '"') {
      quoted = true
    } else if (char === ',') {
      row.push(field)
      field = ''
    } else if (char === '\n') {
      row.push(field.replace(/\r$/, ''))
      onRow(row)
      row = []
      field = ''
    } else {
      field += char
    }
  }

  if (field || row.length) {
    row.push(field)
    onRow(row)
  }
}

const writeJson = (file, value) => {
  fs.writeFileSync(file, JSON.stringify(value), 'utf8')
}

ensureDir(bucketRoot)
ensureDir(formRoot)

for (const dir of [bucketRoot, formRoot]) {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, item.name)
    if (item.isFile() && item.name.endsWith('.json')) fs.rmSync(file)
  }
}

const csv = fs.readFileSync(csvPath, 'utf8')
let headers = []
let rowCount = 0
let keptCount = 0
const buckets = new Map()

parseCsv(csv, (row) => {
  if (!headers.length) {
    headers = row
    return
  }

  rowCount += 1
  const record = Object.fromEntries(headers.map((header, index) => [header, row[index] || '']))
  const word = record.word?.trim()
  const key = normalizeWord(word || '')
  if (!word || !key) return

  const translation = record.translation?.trim()
  const definition = record.definition?.trim()
  if (!translation && !definition) return

  const bucket = bucketOf(key)
  if (!buckets.has(bucket)) buckets.set(bucket, {})
  buckets.get(bucket)[key] = [
    word,
    record.phonetic?.trim() || '',
    translation || '',
    definition || '',
    record.pos?.trim() || '',
    Number(record.collins || 0) || 0,
    Number(record.oxford || 0) || 0,
    record.tag?.trim() || '',
    record.exchange?.trim() || '',
  ]
  keptCount += 1
})

const bucketStats = {}
for (const [bucket, entries] of [...buckets.entries()].sort()) {
  const file = path.join(bucketRoot, `${bucket}.json`)
  writeJson(file, entries)
  bucketStats[bucket] = Object.keys(entries).length
}

const forms = new Map()
const lemmaLines = fs.readFileSync(lemmaPath, 'utf8').split(/\r?\n/)
for (const line of lemmaLines) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith(';') || !trimmed.includes('->')) continue

  const [lemmaPart, variantsPart] = trimmed.split('->')
  const lemma = normalizeWord(lemmaPart.split('/')[0] || '')
  if (!lemma) continue

  const variants = variantsPart
    .split(',')
    .map(normalizeWord)
    .filter(Boolean)

  for (const variant of variants) {
    if (variant === lemma) continue
    const bucket = bucketOf(variant)
    if (!forms.has(bucket)) forms.set(bucket, {})
    const entry = forms.get(bucket)
    if (!entry[variant]) entry[variant] = []
    if (!entry[variant].includes(lemma)) entry[variant].push(lemma)
  }
}

const formStats = {}
for (const [bucket, entries] of [...forms.entries()].sort()) {
  const file = path.join(formRoot, `${bucket}.json`)
  writeJson(file, entries)
  formStats[bucket] = Object.keys(entries).length
}

writeJson(path.join(outRoot, 'index.json'), {
  name: 'ECDICT',
  license: 'MIT',
  source: 'https://github.com/skywind3000/ECDICT',
  generatedAt: new Date().toISOString(),
  rowCount,
  keptCount,
  bucketStats,
  formStats,
  fields: [
    'word',
    'phonetic',
    'translation',
    'definition',
    'pos',
    'collins',
    'oxford',
    'tag',
    'exchange',
  ],
})

console.log(`Built ECDICT buckets: ${keptCount}/${rowCount} entries`)
