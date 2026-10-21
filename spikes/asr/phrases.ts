// Spike corpus script. Prompts use numerals so speakers say numbers the way
// they naturally would ("120" → "one twenty" or "one hundred twenty").
// All values are synthetic.

import type { CandidateIssueKind, VitalField } from '@/domain/vitals'

export interface CorpusPhrase {
  id: string
  prompt: string
  expected: Partial<Record<VitalField, number>>
  // For phrases that should be flagged rather than filled.
  expectIssue?: { field: VitalField; kind: CandidateIssueKind }
}

export const PHRASES: CorpusPhrase[] = [
  { id: 'p01', prompt: 'Blood pressure 120 over 80', expected: { systolic: 120, diastolic: 80 } },
  { id: 'p02', prompt: 'Temperature 36.7', expected: { temperature: 36.7 } },
  { id: 'p03', prompt: 'Pulse 76', expected: { pulse: 76 } },
  { id: 'p04', prompt: 'Respiratory rate 18', expected: { respiratoryRate: 18 } },
  { id: 'p05', prompt: 'Oxygen saturation 98', expected: { spo2: 98 } },
  {
    id: 'p06',
    prompt: 'BP 120 over 80, pulse 76, respiratory rate 18, oxygen 98, temperature 36.7',
    expected: { systolic: 120, diastolic: 80, pulse: 76, respiratoryRate: 18, spo2: 98, temperature: 36.7 },
  },
  { id: 'p07', prompt: 'Respiratory rate 16', expected: { respiratoryRate: 16 } },
  { id: 'p08', prompt: 'Pulse 60', expected: { pulse: 60 } },
  { id: 'p09', prompt: 'Respiratory rate 13', expected: { respiratoryRate: 13 } },
  { id: 'p10', prompt: 'Pulse 50', expected: { pulse: 50 } },
  { id: 'p11', prompt: 'Heart rate 115', expected: { pulse: 115 } },
  { id: 'p12', prompt: 'Temperature 38.5', expected: { temperature: 38.5 } },
  { id: 'p13', prompt: 'Temp 37.0', expected: { temperature: 37 } },
  { id: 'p14', prompt: 'BP 90 over 60', expected: { systolic: 90, diastolic: 60 } },
  {
    id: 'p15',
    prompt: 'BP 140 over 90, pulse 88, sat 95',
    expected: { systolic: 140, diastolic: 90, pulse: 88, spo2: 95 },
  },
  {
    id: 'p16',
    prompt: 'Blood pressure 110 over … (stop without the second number)',
    expected: {},
    expectIssue: { field: 'diastolic', kind: 'incomplete' },
  },
  {
    id: 'p17',
    prompt: 'Pulse 72, pulse 80 (say both)',
    expected: {},
    expectIssue: { field: 'pulse', kind: 'conflict' },
  },
]

// Clip names: <speaker>_<mic>_<noise>_<phraseId>_<take>.wav, e.g. P1_headset_quiet_p06_1.wav
export interface ClipInfo {
  speaker: string
  mic: string
  noise: string
  phrase: CorpusPhrase
  take: string
}

export function clipName(speaker: string, mic: string, noise: string, phraseId: string, take: number) {
  return `${speaker}_${mic}_${noise}_${phraseId}_${take}.wav`
}

export function parseClipName(name: string): ClipInfo | null {
  const m = /^([^_]+)_([^_]+)_([^_]+)_(p\d+)_(\d+)\.wav$/i.exec(name)
  const phrase = m && PHRASES.find((p) => p.id === m[4].toLowerCase())
  if (!m || !phrase) return null
  return { speaker: m[1], mic: m[2], noise: m[3], phrase, take: m[5] }
}
