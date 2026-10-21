import type { VoskClient } from '@lichess-org/vosk-browser'
import type { MeasurementCandidate } from '@/domain/vitals'
import { parseVitalsPhrase, VOICE_GRAMMAR } from '@/parsing/voicePhrase'
import { concat, decodeToMono, encodeWav, resample, startMic, type MicCapture } from '../shared/audio'
import { $, download, environment, h, holdToTalk, pct, toCsv } from '../shared/ui'
import { loadVosk, type ModelId, VoskSession } from '../shared/vosk'
import { clipName, parseClipName, PHRASES } from './phrases'
import { scoreClip, type ClipScore } from './score'

let client: VoskClient | null = null
let loadedModel: ModelId | null = null
let activeTab = 'live'

type GrammarMode = 'full' | 'no-letters' | 'off'
const grammarMode = () => ($('#grammar') as HTMLSelectElement).value as GrammarMode
const padOn = () => ($('#pad') as HTMLInputElement).checked
// "no-letters" drops spelled synonyms like "b p" / "h r": single letters give
// the decoder cheap substitutes for parts of numbers.
const grammar = () => {
  const mode = grammarMode()
  if (mode === 'off') return null
  return mode === 'full' ? VOICE_GRAMMAR : VOICE_GRAMMAR.filter((w) => w.length > 1 || w === 'a')
}

// ── Tabs ────────────────────────────────────────────────────────────────
document.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((tab) => {
  tab.addEventListener('click', () => {
    activeTab = tab.dataset.tab!
    document.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((t) =>
      t.setAttribute('aria-pressed', String(t === tab)),
    )
    document.querySelectorAll<HTMLElement>('[data-panel]').forEach((p) => {
      p.hidden = p.dataset.panel !== activeTab
    })
  })
})

// ── Model loading ───────────────────────────────────────────────────────
$('#load').addEventListener('click', async () => {
  const model = ($('#model') as HTMLSelectElement).value as ModelId
  const status = $('#load-status')
  client?.terminate()
  client = null
  setReady(false)
  status.textContent = 'Loading…'
  const t0 = performance.now()
  try {
    client = await loadVosk(model)
    loadedModel = model
    status.textContent = `Loaded ${model} in ${Math.round(performance.now() - t0)} ms (${navigator.onLine ? 'online' : 'offline'})`
    status.dataset.loadMs = String(Math.round(performance.now() - t0))
    setReady(true)
  } catch (e) {
    status.textContent = `Failed: ${e}`
  }
})

function setReady(ready: boolean) {
  ;($('#talk') as HTMLButtonElement).disabled = !ready
  ;($('#run-batch') as HTMLButtonElement).disabled = !ready
}

// ── Live push-to-talk ───────────────────────────────────────────────────
let mic: MicCapture | null = null
let session: VoskSession | null = null
let liveCount = 0

holdToTalk(
  $('#talk') as HTMLButtonElement,
  {
    async start() {
      if (!client) return
      $('#partial').textContent = ''
      $('#mic-live').hidden = false
      try {
        mic = await startMic((samples, rate) => session?.feed(samples, rate))
        session = new VoskSession(client, mic.sampleRate, grammar(), (t) => ($('#partial').textContent = t))
      } catch (e) {
        $('#mic-live').hidden = true
        $('#partial').textContent = `Microphone unavailable: ${e}`
      }
    },
    async stop() {
      if (!mic || !session) return
      const released = performance.now()
      const [m, s] = [mic, session]
      mic = session = null
      await m.stop()
      $('#mic-live').hidden = true
      const transcript = await s.end()
      const latency = Math.round(performance.now() - released)
      s.dispose()
      const parsed = parseVitalsPhrase(transcript)
      $('#live-result').replaceChildren(renderCandidates(parsed.candidates, parsed.unrecognized))
      $('#live-log tbody').prepend(
        h('tr', {},
          h('td', {}, String(++liveCount)),
          h('td', { class: 'mono' }, transcript || '(nothing)'),
          h('td', {}, summarize(parsed.candidates)),
          h('td', {}, `${latency} ms`),
          h('td', { class: m.released() ? 'ok' : 'bad' }, m.released() ? 'yes' : 'NO'),
        ),
      )
    },
    async cancel() {
      await mic?.stop()
      session?.dispose()
      mic = session = null
      $('#mic-live').hidden = true
      $('#partial').textContent = '(cancelled)'
    },
  },
  () => activeTab === 'live',
)

function summarize(candidates: MeasurementCandidate[]): string {
  return candidates.map((c) => `${c.field}=${c.value ?? '⚑'}`).join(' ') || '—'
}

function renderCandidates(candidates: MeasurementCandidate[], unrecognized: string[]) {
  return h('table', {},
    h('thead', {}, h('tr', {}, h('th', {}, 'Field'), h('th', {}, 'Value'), h('th', {}, 'Flags'), h('th', {}, 'From'))),
    h('tbody', {},
      ...candidates.map((c) =>
        h('tr', {},
          h('td', {}, c.field),
          h('td', { class: 'mono' }, c.value === null ? '—' : String(c.value)),
          h('td', { class: c.issues.length ? 'warn' : '' },
            c.issues.map((i) => `${i.message}${i.options ? ` [${i.options.join(' | ')}]` : ''}`).join(' ')),
          h('td', { class: 'mono' }, c.original),
        ),
      ),
      unrecognized.length
        ? h('tr', {}, h('td', {}, 'Unrecognized'), h('td', { class: 'mono', colSpan: 3 }, unrecognized.join(' ')))
        : null,
    ),
  )
}

// ── Batch scoring ───────────────────────────────────────────────────────
interface BatchRow {
  clip: string
  speaker: string
  mic: string
  noise: string
  phrase: string
  transcript: string
  parsed: string
  score: ClipScore
  processingMs: number
  audioMs: number
}
let batchRows: BatchRow[] = []

$('#run-batch').addEventListener('click', async () => {
  if (!client) return
  const files = [...(($('#clips') as HTMLInputElement).files ?? [])]
  const tbody = $('#batch-table tbody')
  tbody.replaceChildren()
  $('#batch-summary').replaceChildren()
  batchRows = []
  for (const file of files) {
    const info = parseClipName(file.name)
    if (!info) {
      tbody.append(h('tr', {}, h('td', { class: 'bad', colSpan: 7 }, `${file.name}: name does not match the convention`)))
      continue
    }
    const samples = await decodeToMono(file, 16000)
    const s = new VoskSession(client, 16000, grammar())
    const t0 = performance.now()
    if (padOn()) s.feed(new Float32Array(8000), 16000)
    for (let i = 0; i < samples.length; i += 4096) s.feed(samples.subarray(i, i + 4096), 16000)
    const transcript = await s.end()
    const processingMs = Math.round(performance.now() - t0)
    s.dispose()
    const { candidates } = parseVitalsPhrase(transcript)
    const score = scoreClip(info.phrase, candidates)
    const row: BatchRow = {
      clip: file.name, speaker: info.speaker, mic: info.mic, noise: info.noise, phrase: info.phrase.id,
      transcript, parsed: summarize(candidates), score, processingMs,
      audioMs: Math.round((samples.length / 16000) * 1000),
    }
    batchRows.push(row)
    tbody.append(
      h('tr', {},
        h('td', { class: 'mono' }, file.name),
        h('td', { class: 'mono' }, transcript || '(nothing)'),
        h('td', { class: 'mono' }, row.parsed),
        h('td', { class: score.correctFields === score.expectedFields ? 'ok' : '' }, `${score.correctFields}/${score.expectedFields}`),
        h('td', { class: score.wrongValues ? 'bad' : '' }, String(score.wrongValues)),
        h('td', { class: score.missed ? 'warn' : '' }, String(score.missed)),
        h('td', {}, String(processingMs)),
      ),
    )
  }
  renderSummary()
  ;($('#dl-json') as HTMLButtonElement).disabled = batchRows.length === 0
  ;($('#dl-csv') as HTMLButtonElement).disabled = batchRows.length === 0
})

function totals(rows: BatchRow[]) {
  const sum = (k: keyof ClipScore) => rows.reduce((n, r) => n + (r.score[k] as number), 0)
  return {
    clips: rows.length,
    fieldAccuracy: pct(sum('correctFields'), sum('expectedFields')),
    wrongValues: sum('wrongValues'),
    missed: sum('missed'),
    realTimeFactor: (rows.reduce((n, r) => n + r.processingMs, 0) / Math.max(1, rows.reduce((n, r) => n + r.audioMs, 0))).toFixed(2),
  }
}

function renderSummary() {
  const groups = new Map<string, BatchRow[]>()
  for (const r of batchRows) {
    for (const key of ['All', `mic: ${r.mic}`, `noise: ${r.noise}`, `speaker: ${r.speaker}`]) {
      groups.set(key, [...(groups.get(key) ?? []), r])
    }
  }
  const config = `${loadedModel}, grammar ${grammarMode()}, lead-in silence ${padOn() ? 'on' : 'off'}`
  $('#batch-summary').replaceChildren(
    h('p', {}, `Configuration: ${config}`),
    h('table', { id: 'summary' },
      h('thead', {}, h('tr', {}, ...['Group', 'Clips', 'Field accuracy', 'Wrong values', 'Missed', 'Real-time factor'].map((t) => h('th', {}, t)))),
      h('tbody', {},
        ...[...groups].map(([name, rows]) => {
          const t = totals(rows)
          return h('tr', {}, h('td', {}, name), h('td', {}, String(t.clips)), h('td', {}, t.fieldAccuracy),
            h('td', { class: t.wrongValues ? 'bad' : '' }, String(t.wrongValues)), h('td', {}, String(t.missed)), h('td', {}, t.realTimeFactor))
        }),
      ),
    ),
  )
}

function reportName(ext: string) {
  return `asr-${loadedModel}-grammar-${grammarMode()}-${new Date().toISOString().slice(0, 10)}.${ext}`
}

$('#dl-json').addEventListener('click', () =>
  download(reportName('json'), JSON.stringify({
    config: { model: loadedModel, grammar: grammarMode(), leadInSilence: padOn() }, environment: environment(),
    summary: totals(batchRows), rows: batchRows,
  }, null, 2), 'application/json'),
)
$('#dl-csv').addEventListener('click', () =>
  download(reportName('csv'), toCsv(batchRows.map(({ score, ...r }) => ({
    ...r, model: loadedModel, grammar: grammarMode(), leadInSilence: padOn(),
    expectedFields: score.expectedFields, correctFields: score.correctFields,
    wrongValues: score.wrongValues, missed: score.missed,
  }))), 'text/csv'),
)

// ── Corpus recorder ─────────────────────────────────────────────────────
let phraseIndex = 0
let recMic: MicCapture | null = null
let recChunks: Float32Array[] = []
let pendingClip: Blob | null = null
const takes = new Map<string, number>()

function showPhrase() {
  const p = PHRASES[phraseIndex]
  $('#phrase-pos').textContent = `${phraseIndex + 1} of ${PHRASES.length} (${p.id})`
  $('#phrase-prompt').textContent = p.prompt
  ;($('#playback') as HTMLAudioElement).hidden = true
  ;($('#keep') as HTMLButtonElement).disabled = true
  pendingClip = null
}
showPhrase()

holdToTalk(
  $('#rec') as HTMLButtonElement,
  {
    async start() {
      recChunks = []
      $('#rec-live').hidden = false
      recMic = await startMic((samples) => recChunks.push(samples))
    },
    async stop() {
      if (!recMic) return
      const rate = recMic.sampleRate
      await recMic.stop()
      recMic = null
      $('#rec-live').hidden = true
      pendingClip = encodeWav(await resample(concat(recChunks), rate, 16000), 16000)
      recChunks = []
      const audio = $('#playback') as HTMLAudioElement
      audio.src = URL.createObjectURL(pendingClip)
      audio.hidden = false
      ;($('#keep') as HTMLButtonElement).disabled = false
    },
    async cancel() {
      await recMic?.stop()
      recMic = null
      recChunks = []
      $('#rec-live').hidden = true
    },
  },
  () => activeTab === 'record',
)

$('#keep').addEventListener('click', () => {
  if (!pendingClip) return
  const p = PHRASES[phraseIndex]
  const speaker = ($('#speaker') as HTMLInputElement).value.trim() || 'P0'
  const micType = ($('#mic') as HTMLSelectElement).value
  const noise = ($('#noise') as HTMLSelectElement).value
  const key = `${speaker}_${micType}_${noise}_${p.id}`
  const take = (takes.get(key) ?? 0) + 1
  takes.set(key, take)
  download(clipName(speaker, micType, noise, p.id, take), pendingClip)
  phraseIndex = Math.min(phraseIndex + 1, PHRASES.length - 1)
  showPhrase()
})
$('#prev').addEventListener('click', () => {
  phraseIndex = Math.max(0, phraseIndex - 1)
  showPhrase()
})
$('#skip').addEventListener('click', () => {
  phraseIndex = Math.min(phraseIndex + 1, PHRASES.length - 1)
  showPhrase()
})
