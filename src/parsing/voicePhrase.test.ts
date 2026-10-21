import { describe, expect, it } from 'vitest'
import type { VitalField } from '@/domain/vitals'
import { parseVitalsPhrase, VOICE_GRAMMAR } from './voicePhrase'

function values(transcript: string): Partial<Record<VitalField, number | null>> {
  const out: Partial<Record<VitalField, number | null>> = {}
  for (const c of parseVitalsPhrase(transcript).candidates) out[c.field] = c.value
  return out
}

function issue(transcript: string, field: VitalField) {
  return parseVitalsPhrase(transcript).candidates.find((c) => c.field === field)?.issues[0]
}

describe('single measurements', () => {
  it.each([
    ['blood pressure one twenty over eighty', { systolic: 120, diastolic: 80 }],
    ['bp one hundred and twenty over eighty', { systolic: 120, diastolic: 80 }],
    ['b p ninety over sixty', { systolic: 90, diastolic: 60 }],
    ['blood pressure one forty slash ninety', { systolic: 140, diastolic: 90 }],
    ['temperature thirty six point seven', { temperature: 36.7 }],
    ['temp thirty seven point oh', { temperature: 37 }],
    ['temperature thirty eight', { temperature: 38 }],
    ['pulse seventy six', { pulse: 76 }],
    ['heart rate one hundred fifteen', { pulse: 115 }],
    ['pulse one oh five', { pulse: 105 }],
    ['pulse a hundred', { pulse: 100 }],
    ['respiratory rate eighteen', { respiratoryRate: 18 }],
    ['r r thirty', { respiratoryRate: 30 }],
    ['oxygen saturation ninety eight', { spo2: 98 }],
    ['sat ninety five percent', { spo2: 95 }],
    ['o two one hundred', { spo2: 100 }],
  ])('%s', (transcript, expected) => {
    expect(values(transcript)).toEqual(expected)
  })
})

describe('combined dictation', () => {
  it('reads all five vitals in one utterance', () => {
    expect(
      values('bp one twenty over eighty pulse seventy six respiratory rate eighteen oxygen ninety eight temperature thirty six point seven'),
    ).toEqual({ systolic: 120, diastolic: 80, pulse: 76, respiratoryRate: 18, spo2: 98, temperature: 36.7 })
  })

  it('accepts digits and punctuation from engines that output them', () => {
    expect(values('BP 120/80, pulse 76, temp 36.7')).toEqual({
      systolic: 120, diastolic: 80, pulse: 76, temperature: 36.7,
    })
  })

  it('does not confuse "pulse ox" with pulse', () => {
    expect(values('pulse ox ninety seven pulse eighty')).toEqual({ spo2: 97, pulse: 80 })
  })

  it('reports words before the first keyword as unrecognized', () => {
    expect(parseVitalsPhrase('patient okay pulse seventy').unrecognized).toEqual(['patient', 'okay'])
  })

  it('returns nothing for an empty transcript', () => {
    expect(parseVitalsPhrase('')).toEqual({ candidates: [], unrecognized: [] })
  })
})

describe('never guesses', () => {
  it('flags a field said twice with different values as a conflict', () => {
    expect(values('pulse seventy two pulse eighty')).toEqual({ pulse: null })
    expect(issue('pulse seventy two pulse eighty', 'pulse')).toMatchObject({ kind: 'conflict', options: [72, 80] })
  })

  it('accepts a field repeated with the same value', () => {
    expect(values('pulse seventy pulse seventy')).toEqual({ pulse: 70 })
  })

  it('flags blood pressure without a diastolic value', () => {
    expect(values('blood pressure one ten over')).toEqual({ systolic: null, diastolic: null })
    expect(issue('blood pressure one ten over', 'diastolic')).toMatchObject({ kind: 'incomplete' })
  })

  it('flags blood pressure missing "over"', () => {
    expect(values('bp one twenty eighty')).toEqual({ systolic: null, diastolic: null })
    expect(issue('bp one twenty eighty', 'systolic')).toMatchObject({ kind: 'ambiguous', options: [120] })
  })

  it('offers 36.7 for "thirty six seven" without applying it', () => {
    expect(values('temperature thirty six seven')).toEqual({ temperature: null })
    expect(issue('temperature thirty six seven', 'temperature')).toMatchObject({ kind: 'ambiguous', options: [36.7] })
  })

  it('flags two numbers after one keyword', () => {
    expect(issue('pulse seventy six eighty', 'pulse')).toMatchObject({ kind: 'ambiguous', options: [76, 80] })
  })

  it('does not read "nine zero" as 900', () => {
    expect(values('bp one forty over nine zero')).toEqual({ systolic: null, diastolic: null })
    expect(values('pulse nine zero')).toEqual({ pulse: null })
    expect(issue('pulse nine zero', 'pulse')).toMatchObject({ kind: 'ambiguous', options: [9, 0] })
  })

  it('flags a keyword with no number', () => {
    expect(issue('pulse', 'pulse')).toMatchObject({ kind: 'incomplete' })
  })

  it('keeps the transcript fragment as the original', () => {
    const [c] = parseVitalsPhrase('um pulse seventy six').candidates
    expect(c).toMatchObject({ method: 'voice', original: 'pulse seventy six' })
  })
})

describe('grammar', () => {
  it('contains every keyword and number word exactly once', () => {
    expect(new Set(VOICE_GRAMMAR).size).toBe(VOICE_GRAMMAR.length)
    for (const w of ['pulse', 'oxygen', 'hundred', 'point', 'over', 'seventy', '[unk]']) {
      expect(VOICE_GRAMMAR).toContain(w)
    }
  })
})
