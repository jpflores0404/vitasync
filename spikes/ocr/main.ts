import { createWorker, OEM, type Worker } from 'tesseract.js'
import { $, download, environment, h, pct, toCsv } from '../shared/ui'

interface Source {
  name: string
  bitmap: ImageBitmap
  crop: { x: number; y: number; w: number; h: number } | null
}
interface Row {
  image: string
  settings: string
  text: string
  confidence: number
  numbers: number[]
  expected: number[] | null
  exact: boolean | null
  ignoringDecimal: boolean | null
  ms: number
}

let sources: Source[] = []
let index = 0
const rows: Row[] = []
const workers = new Map<string, Worker>()

// ── Loading images ──────────────────────────────────────────────────────
$('#files').addEventListener('change', async (e) => {
  const files = [...((e.target as HTMLInputElement).files ?? [])]
  sources.forEach((s) => s.bitmap.close())
  sources = await Promise.all(files.map(async (f) => ({ name: f.name, bitmap: await createImageBitmap(f), crop: null })))
  index = 0
  show()
})

let stream: MediaStream | null = null
$('#cam-start').addEventListener('click', async () => {
  const video = $('#video') as HTMLVideoElement
  if (stream) {
    stream.getTracks().forEach((t) => t.stop())
    stream = null
    video.hidden = true
    $('#cam-capture').hidden = true
    $('#cam-start').textContent = 'Use webcam'
    return
  }
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1920 } } })
  } catch (err) {
    $('#status').textContent = `Camera unavailable: ${err}`
    return
  }
  video.srcObject = stream
  video.hidden = false
  $('#cam-capture').hidden = false
  $('#cam-start').textContent = 'Stop webcam'
})
$('#cam-capture').addEventListener('click', async () => {
  const video = $('#video') as HTMLVideoElement
  const bitmap = await createImageBitmap(video)
  sources.push({ name: `webcam_${sources.length + 1}.png`, bitmap, crop: null })
  index = sources.length - 1
  show()
})

$('#prev').addEventListener('click', () => {
  index = Math.max(0, index - 1)
  show()
})
$('#next').addEventListener('click', () => {
  index = Math.min(sources.length - 1, index + 1)
  show()
})

// ── Display and crop ────────────────────────────────────────────────────
const view = $('#view') as HTMLCanvasElement
let scale = 1

function show() {
  const src = sources[index]
  $('#pos').textContent = src ? `${index + 1} / ${sources.length} — ${src.name}` : 'No image'
  if (!src) return
  scale = Math.min(1, 800 / src.bitmap.width)
  view.width = Math.round(src.bitmap.width * scale)
  view.height = Math.round(src.bitmap.height * scale)
  drawView()
}

function drawView() {
  const src = sources[index]
  const ctx = view.getContext('2d')!
  ctx.drawImage(src.bitmap, 0, 0, view.width, view.height)
  if (src.crop) {
    ctx.strokeStyle = '#2563eb'
    ctx.lineWidth = 3
    ctx.strokeRect(src.crop.x * scale, src.crop.y * scale, src.crop.w * scale, src.crop.h * scale)
  }
}

let dragStart: { x: number; y: number } | null = null
const toImage = (e: PointerEvent) => {
  const r = view.getBoundingClientRect()
  return { x: ((e.clientX - r.left) * (view.width / r.width)) / scale, y: ((e.clientY - r.top) * (view.height / r.height)) / scale }
}
view.addEventListener('pointerdown', (e) => {
  if (!sources[index]) return
  view.setPointerCapture(e.pointerId)
  dragStart = toImage(e)
})
view.addEventListener('pointermove', (e) => {
  if (!dragStart) return
  const p = toImage(e)
  sources[index].crop = {
    x: Math.min(dragStart.x, p.x), y: Math.min(dragStart.y, p.y),
    w: Math.abs(p.x - dragStart.x), h: Math.abs(p.y - dragStart.y),
  }
  drawView()
})
view.addEventListener('pointerup', () => {
  dragStart = null
  const c = sources[index]?.crop
  if (c && (c.w < 10 || c.h < 10)) {
    sources[index].crop = null
    drawView()
  }
})

// ── Preprocessing ───────────────────────────────────────────────────────
// Crop → scale to a fixed text height → grayscale → Otsu threshold →
// dark-on-light → optional dilation to join 7-segment strokes.
function preprocess(src: Source): HTMLCanvasElement {
  const crop = src.crop ?? { x: 0, y: 0, w: src.bitmap.width, h: src.bitmap.height }
  const targetH = Number(($('#height') as HTMLInputElement).value)
  const s = targetH / crop.h
  const out = $('#processed') as HTMLCanvasElement
  out.width = Math.max(1, Math.round(crop.w * s))
  out.height = Math.max(1, Math.round(crop.h * s))
  const ctx = out.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(src.bitmap, crop.x, crop.y, crop.w, crop.h, 0, 0, out.width, out.height)
  const img = ctx.getImageData(0, 0, out.width, out.height)
  const px = img.data
  const n = out.width * out.height
  const gray = new Uint8Array(n)
  for (let i = 0; i < n; i++) gray[i] = Math.round(0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2])

  const t = otsu(gray)
  let dark: Uint8Array = new Uint8Array(n)
  let darkCount = 0
  for (let i = 0; i < n; i++) if ((dark[i] = gray[i] < t ? 1 : 0)) darkCount++

  const invertMode = ($('#invert') as HTMLSelectElement).value
  // LED displays are light digits on dark; the background is the majority.
  if (invertMode === 'on' || (invertMode === 'auto' && darkCount > n / 2)) {
    for (let i = 0; i < n; i++) dark[i] ^= 1
  }
  if (($('#close') as HTMLInputElement).checked) dark = dilate(dark, out.width, out.height)

  for (let i = 0; i < n; i++) {
    const v = dark[i] ? 0 : 255
    px[i * 4] = px[i * 4 + 1] = px[i * 4 + 2] = v
    px[i * 4 + 3] = 255
  }
  ctx.putImageData(img, 0, 0)
  return out
}

function otsu(gray: Uint8Array): number {
  const hist = new Array(256).fill(0)
  for (const g of gray) hist[g]++
  const total = gray.length
  const sumAll = hist.reduce((s, c, i) => s + c * i, 0)
  let sumB = 0, wB = 0, best = 0, threshold = 127
  for (let i = 0; i < 256; i++) {
    wB += hist[i]
    if (wB === 0) continue
    const wF = total - wB
    if (wF === 0) break
    sumB += i * hist[i]
    const between = wB * wF * (sumB / wB - (sumAll - sumB) / wF) ** 2
    if (between > best) [best, threshold] = [between, i]
  }
  return threshold
}

function dilate(src: Uint8Array, w: number, hgt: number): Uint8Array {
  const out = new Uint8Array(src.length)
  for (let y = 0; y < hgt; y++)
    for (let x = 0; x < w; x++) {
      let on = 0
      for (let dy = -1; dy <= 1 && !on; dy++)
        for (let dx = -1; dx <= 1 && !on; dx++) {
          const yy = y + dy, xx = x + dx
          if (yy >= 0 && yy < hgt && xx >= 0 && xx < w && src[yy * w + xx]) on = 1
        }
      out[y * w + x] = on
    }
  return out
}

// ── OCR ─────────────────────────────────────────────────────────────────
async function getWorker(lang: string): Promise<Worker> {
  let w = workers.get(lang)
  if (!w) {
    $('#status').textContent = `Loading ${lang}…`
    w = await createWorker(lang, OEM.LSTM_ONLY, {
      workerPath: '/tesseract/worker.min.js',
      corePath: '/tesseract',
      langPath: '/tesseract/lang',
      workerBlobURL: false,
    })
    workers.set(lang, w)
  }
  return w
}

function expectedFromName(name: string): number[] | null {
  const m = /^(thermo|oxi)_([\d.]+(?:-[\d.]+)*)_/i.exec(name)
  return m ? m[2].split('-').map(Number) : null
}

const sameSet = (a: number[], b: number[]) => a.length === b.length && [...a].sort().join() === [...b].sort().join()

$('#run').addEventListener('click', async () => {
  const src = sources[index]
  if (!src) return
  const lang = ($('#lang') as HTMLSelectElement).value
  const psm = ($('#psm') as HTMLSelectElement).value
  const worker = await getWorker(lang)
  await worker.setParameters({
    tessedit_char_whitelist: '0123456789.',
    tessedit_pageseg_mode: psm as never,
  })
  const canvas = preprocess(src)
  const t0 = performance.now()
  const { data } = await worker.recognize(canvas)
  const ms = Math.round(performance.now() - t0)
  const text = data.text.trim()
  const numbers = (text.match(/\d+(?:\.\d+)?/g) ?? []).map(Number)
  const expected = expectedFromName(src.name)
  const stripDots = (xs: number[]) => xs.map((x) => Number(String(x).replace('.', '')))
  const row: Row = {
    image: src.name,
    settings: `${lang} psm${psm} h${($('#height') as HTMLInputElement).value} inv:${($('#invert') as HTMLSelectElement).value}${($('#close') as HTMLInputElement).checked ? ' close' : ''}${src.crop ? ' cropped' : ''}`,
    text, confidence: Math.round(data.confidence), numbers, expected,
    exact: expected ? sameSet(numbers, expected) : null,
    ignoringDecimal: expected ? sameSet(stripDots(numbers), stripDots(expected)) : null,
    ms,
  }
  rows.push(row)
  $('#status').textContent = `${ms} ms, confidence ${row.confidence}`
  $('#result').replaceChildren(
    h('p', {}, 'Text: ', h('span', { class: 'mono' }, text || '(nothing)')),
    h('p', {}, `Numbers: ${numbers.join(', ') || '—'}`, expected ? ` · Expected: ${expected.join(', ')}` : ''),
  )
  const mark = (v: boolean | null) => h('td', { class: v === null ? '' : v ? 'ok' : 'bad' }, v === null ? '—' : v ? 'yes' : 'no')
  $('#results tbody').prepend(
    h('tr', {},
      h('td', { class: 'mono' }, row.image), h('td', { class: 'mono' }, row.settings), h('td', { class: 'mono' }, text),
      h('td', {}, numbers.join(', ')), h('td', {}, expected?.join(', ') ?? '—'), mark(row.exact), mark(row.ignoringDecimal),
      h('td', {}, String(ms)),
    ),
  )
  renderSummary()
  ;($('#dl-json') as HTMLButtonElement).disabled = false
  ;($('#dl-csv') as HTMLButtonElement).disabled = false
})

// Latest attempt per image, so retries with better settings replace earlier ones.
function latestPerImage(): Row[] {
  const latest = new Map<string, Row>()
  for (const r of rows) if (r.expected) latest.set(r.image, r)
  return [...latest.values()]
}

function renderSummary() {
  const scored = latestPerImage()
  const exact = scored.filter((r) => r.exact).length
  const loose = scored.filter((r) => r.ignoringDecimal).length
  $('#summary').replaceChildren(
    h('p', {}, `Scored images (latest attempt each): ${scored.length} · exact ${exact} (${pct(exact, scored.length)}) · ignoring decimal point ${loose} (${pct(loose, scored.length)}) · threshold for "go": 66.7% exact`),
  )
}

const name = (ext: string) => `ocr-${new Date().toISOString().slice(0, 10)}.${ext}`
$('#dl-json').addEventListener('click', () =>
  download(name('json'), JSON.stringify({ environment: environment(), latestPerImage: latestPerImage(), allAttempts: rows }, null, 2), 'application/json'),
)
$('#dl-csv').addEventListener('click', () =>
  download(name('csv'), toCsv(rows.map((r) => ({ ...r, numbers: r.numbers.join(' '), expected: r.expected?.join(' ') ?? '' }))), 'text/csv'),
)

show()
