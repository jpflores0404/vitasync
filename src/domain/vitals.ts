// Shared measurement vocabulary. Every input method (manual, voice, camera)
// produces MeasurementCandidates; nothing here depends on React or browser APIs.

export const VITAL_FIELDS = [
  'temperature',
  'systolic',
  'diastolic',
  'pulse',
  'respiratoryRate',
  'spo2',
] as const

export type VitalField = (typeof VITAL_FIELDS)[number]

export type InputMethod = 'manual' | 'voice' | 'camera'

export const VITAL_UNITS: Record<VitalField, string> = {
  temperature: '°C',
  systolic: 'mmHg',
  diastolic: 'mmHg',
  pulse: '/min',
  respiratoryRate: '/min',
  spo2: '%',
}

export type CandidateIssueKind =
  | 'conflict' // different values for the same field in one capture
  | 'incomplete' // e.g. blood pressure without a diastolic value
  | 'ambiguous' // the phrasing allows more than one reading

export interface CandidateIssue {
  kind: CandidateIssueKind
  message: string
  // Values the nurse can pick with one tap. Never applied automatically.
  options?: number[]
}

export interface MeasurementCandidate {
  field: VitalField
  // null when the input mentioned the field but no single value can be assigned.
  value: number | null
  method: InputMethod
  // The text the value came from: transcript fragment, OCR text, or typed text.
  original: string
  issues: CandidateIssue[]
}
