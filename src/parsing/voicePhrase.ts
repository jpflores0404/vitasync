// Deterministic parser for the fixed vital-signs phrase set (docs/PHRASE_SET.md).
// Input is a speech-engine transcript; output is MeasurementCandidates.
// It never invents values: anything it cannot assign exactly is flagged.

import type {
  CandidateIssue,
  MeasurementCandidate,
  VitalField,
} from '@/domain/vitals'

type Target = 'bp' | 'temperature' | 'pulse' | 'respiratoryRate' | 'spo2'

// Longer phrases are matched first, so "pulse ox" wins over "pulse".
const KEYWORDS: ReadonlyArray<{ words: string[]; target: Target }> = [
  ['blood pressure', 'bp'],
  ['bp', 'bp'],
  ['b p', 'bp'],
  ['temperature', 'temperature'],
  ['temp', 'temperature'],
  ['pulse rate', 'pulse'],
  ['heart rate', 'pulse'],
  ['cardiac rate', 'pulse'],
  ['pulse', 'pulse'],
  ['h r', 'pulse'],
  ['p r', 'pulse'],
  ['c r', 'pulse'],
  ['respiratory rate', 'respiratoryRate'],
  ['respirations', 'respiratoryRate'],
  ['respiration', 'respiratoryRate'],
  ['resp', 'respiratoryRate'],
  ['r r', 'respiratoryRate'],
  ['oxygen saturation', 'spo2'],
  ['pulse oximetry', 'spo2'],
  ['pulse ox', 'spo2'],
  ['s p o two', 'spo2'],
  ['o two sat', 'spo2'],
  ['o two', 'spo2'],
  ['o2', 'spo2'],
  ['oxygen', 'spo2'],
  ['saturation', 'spo2'],
  ['sats', 'spo2'],
  ['sat', 'spo2'],
]
  .map(([phrase, target]) => ({ words: phrase.split(' '), target: target as Target }))
  .sort((a, b) => b.words.length - a.words.length)

const UNITS: Record<string, number> = {
  zero: 0, oh: 0, one: 1, two: 2, three: 3, four: 4,
  five: 5, six: 6, seven: 7, eight: 8, nine: 9,
}
const TEENS: Record<string, number> = {
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14,
  fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
}
const TENS: Record<string, number> = {
  twenty: 20, thirty: 30, forty: 40, fifty: 50,
  sixty: 60, seventy: 70, eighty: 80, ninety: 90,
}
const BP_SEPARATORS = new Set(['over', 'slash', 'by'])
// Spoken units and connective words carry no value and are dropped silently.
const FILLERS = new Set([
  'is', 'of', 'at', 'and', 'the', 'a', 'um', 'uh',
  'percent', 'degrees', 'degree', 'celsius', 'centigrade',
  'beats', 'breaths', 'per', 'minute', 'bpm', 'millimeters', 'mercury',
])

// Every word the parser understands. Used as the restricted grammar for the
// speech engine; "[unk]" lets the engine report out-of-grammar speech.
export const VOICE_GRAMMAR: string[] = [
  ...new Set([
    ...KEYWORDS.flatMap((k) => k.words),
    ...Object.keys(UNITS),
    ...Object.keys(TEENS),
    ...Object.keys(TENS),
    'hundred',
    'point',
    ...BP_SEPARATORS,
    ...FILLERS,
  ]),
  '[unk]',
]

type NumberItem = number | 'sep'

interface Segment {
  target: Target
  words: string[]
}

export interface VoiceParseResult {
  candidates: MeasurementCandidate[]
  // Words that are neither keywords, numbers, nor fillers.
  unrecognized: string[]
}

export function parseVitalsPhrase(transcript: string): VoiceParseResult {
  const tokens = tokenize(transcript)
  const unrecognized: string[] = []
  const segments: Segment[] = []

  for (let i = 0; i < tokens.length; ) {
    const keyword = matchKeyword(tokens, i)
    if (keyword) {
      segments.push({ target: keyword.target, words: tokens.slice(i, i + keyword.words.length) })
      i += keyword.words.length
      continue
    }
    const current = segments.at(-1)
    if (current) current.words.push(tokens[i])
    else if (!FILLERS.has(tokens[i])) unrecognized.push(tokens[i])
    i++
  }

  const perField = new Map<VitalField, MeasurementCandidate[]>()
  const add = (c: MeasurementCandidate) => {
    perField.set(c.field, [...(perField.get(c.field) ?? []), c])
  }

  for (const segment of segments) {
    const keywordLength = matchKeyword(segment.words, 0)!.words.length
    const { items, leftovers } = readNumbers(segment.words.slice(keywordLength))
    unrecognized.push(...leftovers)
    const original = segment.words.join(' ')
    if (segment.target === 'bp') interpretBloodPressure(items, original).forEach(add)
    else add(interpretSingle(segment.target, items, original))
  }

  const candidates = [...perField.values()].map(mergeRepeats)
  return { candidates, unrecognized }
}

function tokenize(transcript: string): string[] {
  return transcript
    .toLowerCase()
    .replace(/(\d)\s*\/\s*(\d)/g, '$1 over $2')
    .replace(/\.(?!\d)/g, ' ')
    .replace(/[^a-z0-9.\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
}

function matchKeyword(tokens: string[], at: number) {
  return KEYWORDS.find((k) => k.words.every((w, j) => tokens[at + j] === w))
}

// Groups number words into values: "one twenty" → 120, "one hundred and five"
// → 105, "thirty six point seven" → 36.7, "one oh five" → 105.
function readNumbers(words: string[]): { items: NumberItem[]; leftovers: string[] } {
  const items: NumberItem[] = []
  const leftovers: string[] = []
  // 'unit' = a lone 1–9 that may still become hundreds ("one twenty").
  type Stage = 'unit' | 'hundred' | 'oh' | 'tens' | 'done'
  // Widened with 'as' because flush/start mutate these inside closures.
  let value = null as number | null
  let stage = 'done' as Stage

  const flush = () => {
    // "nine zero" without a third digit is not "nine oh five"; keep both
    // numbers so the field is flagged instead of reading 900.
    if (value !== null && stage === 'oh') items.push(value / 100, 0)
    else if (value !== null) items.push(value)
    value = null
    stage = 'done'
  }
  const start = (v: number, s: Stage) => {
    flush()
    value = v
    stage = s
  }

  for (let i = 0; i < words.length; i++) {
    const w = words[i]

    if (/^\d+(\.\d+)?$/.test(w)) {
      start(Number(w), 'done')
      continue
    }
    if (w in UNITS) {
      const n = UNITS[w]
      if (value !== null && (stage === 'tens' || stage === 'hundred' || stage === 'oh') && n > 0) {
        value += n
        stage = 'done'
      } else if (value !== null && stage === 'unit' && n === 0) {
        value *= 100
        stage = 'oh'
      } else {
        start(n, n === 0 ? 'done' : 'unit')
      }
      continue
    }
    if (w in TEENS) {
      if (value !== null && (stage === 'hundred' || stage === 'unit')) {
        value = stage === 'unit' ? value * 100 + TEENS[w] : value + TEENS[w]
        stage = 'done'
      } else start(TEENS[w], 'done')
      continue
    }
    if (w in TENS) {
      if (value !== null && (stage === 'hundred' || stage === 'unit')) {
        value = stage === 'unit' ? value * 100 + TENS[w] : value + TENS[w]
      } else start(TENS[w], 'tens')
      stage = 'tens'
      continue
    }
    if (w === 'hundred') {
      if (value !== null && stage === 'unit') {
        value *= 100
        stage = 'hundred'
      } else start(100, 'hundred') // "a hundred" — "a" is a filler
      continue
    }
    if (w === 'point') {
      const digits: number[] = []
      while (i + 1 < words.length && words[i + 1] in UNITS) digits.push(UNITS[words[++i]])
      if (value !== null && digits.length > 0) {
        value = Number(`${value}.${digits.join('')}`)
        flush()
      } else {
        leftovers.push('point')
      }
      continue
    }
    if (BP_SEPARATORS.has(w)) {
      flush()
      items.push('sep')
      continue
    }
    if (w === 'and' && stage === 'hundred') continue
    if (FILLERS.has(w)) continue
    leftovers.push(w)
  }
  flush()
  return { items, leftovers }
}

const FIELD_LABELS: Record<VitalField, string> = {
  temperature: 'temperature',
  systolic: 'systolic',
  diastolic: 'diastolic',
  pulse: 'pulse',
  respiratoryRate: 'respiratory rate',
  spo2: 'oxygen saturation',
}

function candidate(
  field: VitalField,
  value: number | null,
  original: string,
  issues: CandidateIssue[] = [],
): MeasurementCandidate {
  return { field, value, method: 'voice', original, issues }
}

function interpretSingle(field: Target & VitalField, items: NumberItem[], original: string) {
  const numbers = items.filter((x): x is number => x !== 'sep')
  const label = FIELD_LABELS[field]
  if (numbers.length === 1) return candidate(field, numbers[0], original)
  if (numbers.length === 0) {
    return candidate(field, null, original, [
      { kind: 'incomplete', message: `No value heard for ${label}.` },
    ])
  }
  // "thirty six seven" is a common way to say 36.7, but it is still a guess.
  const [whole, digit] = numbers
  if (
    field === 'temperature' &&
    numbers.length === 2 &&
    Number.isInteger(whole) &&
    Number.isInteger(digit) &&
    digit < 10
  ) {
    return candidate(field, null, original, [
      { kind: 'ambiguous', message: `Did you mean ${whole}.${digit}?`, options: [Number(`${whole}.${digit}`)] },
    ])
  }
  return candidate(field, null, original, [
    { kind: 'ambiguous', message: `Heard more than one ${label} value.`, options: unique(numbers) },
  ])
}

function interpretBloodPressure(items: NumberItem[], original: string): MeasurementCandidate[] {
  const sepAt = items.indexOf('sep')
  const before = items.slice(0, sepAt === -1 ? items.length : sepAt).filter((x) => x !== 'sep')
  const after = sepAt === -1 ? [] : items.slice(sepAt + 1).filter((x) => x !== 'sep')

  if (sepAt !== -1 && before.length === 1 && after.length === 1) {
    return [
      candidate('systolic', before[0] as number, original),
      candidate('diastolic', after[0] as number, original),
    ]
  }
  if (sepAt === -1 && before.length === 2) {
    const message = `Say "over" between the numbers. Did you mean ${before[0]}/${before[1]}?`
    return [
      candidate('systolic', null, original, [{ kind: 'ambiguous', message, options: [before[0] as number] }]),
      candidate('diastolic', null, original, [{ kind: 'ambiguous', message, options: [before[1] as number] }]),
    ]
  }
  if (before.length === 1 && after.length === 0) {
    const message = 'Diastolic not heard.'
    return [
      candidate('systolic', null, original, [{ kind: 'incomplete', message, options: [before[0] as number] }]),
      candidate('diastolic', null, original, [{ kind: 'incomplete', message }]),
    ]
  }
  const message = before.length === 0 && after.length === 0
    ? 'No blood pressure value heard.'
    : 'Could not read blood pressure as "systolic over diastolic".'
  return [
    candidate('systolic', null, original, [{ kind: 'incomplete', message }]),
    candidate('diastolic', null, original, [{ kind: 'incomplete', message }]),
  ]
}

// The same field said twice in one utterance: identical values are fine,
// different values become a conflict for the nurse to resolve.
function mergeRepeats(list: MeasurementCandidate[]): MeasurementCandidate {
  if (list.length === 1) return list[0]
  const field = list[0].field
  const original = list.map((c) => c.original).join(' … ')
  const values = unique(list.map((c) => c.value).filter((v): v is number => v !== null))
  const issues = list.flatMap((c) => c.issues)
  if (values.length === 1 && issues.length === 0) return candidate(field, values[0], original)
  if (values.length > 1) {
    issues.unshift({
      kind: 'conflict',
      message: `Heard ${values.length} different ${FIELD_LABELS[field]} values: ${values.join(', ')}.`,
      options: values,
    })
  }
  return candidate(field, null, original, issues)
}

function unique(values: number[]): number[] {
  return [...new Set(values)]
}
