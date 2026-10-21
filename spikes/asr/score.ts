// Field-level scoring: what matters is whether the right number lands in the
// right field, not word error rate.

import type { MeasurementCandidate, VitalField } from '@/domain/vitals'
import type { CorpusPhrase } from './phrases'

export interface ClipScore {
  expectedFields: number
  correctFields: number
  // Values placed in fields the speaker never mentioned, or wrong values
  // presented as certain. These are the dangerous errors.
  wrongValues: number
  // Fields left empty or flagged when a value was expected.
  missed: number
  detail: Partial<Record<VitalField, { expected?: number; got: number | null; flagged: boolean }>>
}

export function scoreClip(phrase: CorpusPhrase, candidates: MeasurementCandidate[]): ClipScore {
  const byField = new Map(candidates.map((c) => [c.field, c]))
  const score: ClipScore = { expectedFields: 0, correctFields: 0, wrongValues: 0, missed: 0, detail: {} }

  for (const [field, expected] of Object.entries(phrase.expected) as [VitalField, number][]) {
    const c = byField.get(field)
    score.expectedFields++
    score.detail[field] = { expected, got: c?.value ?? null, flagged: (c?.issues.length ?? 0) > 0 }
    if (c?.value === expected) score.correctFields++
    else if (c?.value != null) score.wrongValues++
    else score.missed++
  }

  if (phrase.expectIssue) {
    const { field, kind } = phrase.expectIssue
    const c = byField.get(field)
    score.expectedFields++
    score.detail[field] = { got: c?.value ?? null, flagged: (c?.issues.length ?? 0) > 0 }
    if (c && c.value === null && c.issues.some((i) => i.kind === kind)) score.correctFields++
    else if (c?.value != null) score.wrongValues++
    else score.missed++
  }

  for (const c of candidates) {
    const expectedHere = c.field in phrase.expected || phrase.expectIssue?.field === c.field
    if (!expectedHere && c.value !== null) {
      score.wrongValues++
      score.detail[c.field] = { got: c.value, flagged: c.issues.length > 0 }
    }
  }
  return score
}
