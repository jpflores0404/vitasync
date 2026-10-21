// Microphone capture and WAV helpers shared by the ASR spike pages.

// Batches 128-frame render quanta into ~2k-frame chunks so the recognizer
// worker receives tens of messages per second, not hundreds.
const TAP_WORKLET = `
class Tap extends AudioWorkletProcessor {
  constructor() { super(); this.buf = new Float32Array(2048); this.n = 0 }
  process(inputs) {
    const ch = inputs[0][0]
    if (ch) {
      for (let i = 0; i < ch.length; i++) {
        this.buf[this.n++] = ch[i]
        if (this.n === this.buf.length) { this.port.postMessage(this.buf.slice()); this.n = 0 }
      }
    }
    return true
  }
}
registerProcessor('tap', Tap)
`

export interface MicCapture {
  sampleRate: number
  stop(): Promise<void>
  // True once every track has ended, i.e. the browser released the microphone.
  released(): boolean
}

export async function startMic(
  onChunk: (samples: Float32Array, sampleRate: number) => void,
): Promise<MicCapture> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    video: false,
  })
  const ctx = new AudioContext()
  const workletUrl = URL.createObjectURL(new Blob([TAP_WORKLET], { type: 'text/javascript' }))
  await ctx.audioWorklet.addModule(workletUrl)
  URL.revokeObjectURL(workletUrl)
  const source = ctx.createMediaStreamSource(stream)
  const tap = new AudioWorkletNode(ctx, 'tap')
  tap.port.onmessage = (e: MessageEvent<Float32Array>) => onChunk(e.data, ctx.sampleRate)
  source.connect(tap)

  return {
    sampleRate: ctx.sampleRate,
    async stop() {
      tap.port.onmessage = null
      source.disconnect()
      stream.getTracks().forEach((t) => t.stop())
      await ctx.close()
    },
    released: () => stream.getTracks().every((t) => t.readyState === 'ended'),
  }
}

export async function decodeToMono(file: Blob, sampleRate = 16000): Promise<Float32Array> {
  const ctx = new OfflineAudioContext(1, 1, sampleRate)
  const buffer = await ctx.decodeAudioData(await file.arrayBuffer())
  return buffer.getChannelData(0)
}

export async function resample(samples: Float32Array, from: number, to: number): Promise<Float32Array> {
  if (from === to) return samples
  const ctx = new OfflineAudioContext(1, Math.ceil((samples.length * to) / from), to)
  const buffer = ctx.createBuffer(1, samples.length, from)
  buffer.copyToChannel(new Float32Array(samples), 0)
  const src = ctx.createBufferSource()
  src.buffer = buffer
  src.connect(ctx.destination)
  src.start()
  return (await ctx.startRendering()).getChannelData(0)
}

export function concat(chunks: Float32Array[]): Float32Array {
  const out = new Float32Array(chunks.reduce((n, c) => n + c.length, 0))
  let offset = 0
  for (const c of chunks) {
    out.set(c, offset)
    offset += c.length
  }
  return out
}

// 16-bit PCM mono WAV.
export function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const view = new DataView(new ArrayBuffer(44 + samples.length * 2))
  const ascii = (at: number, s: string) => [...s].forEach((ch, i) => view.setUint8(at + i, ch.charCodeAt(0)))
  ascii(0, 'RIFF')
  view.setUint32(4, 36 + samples.length * 2, true)
  ascii(8, 'WAVE')
  ascii(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  ascii(36, 'data')
  view.setUint32(40, samples.length * 2, true)
  samples.forEach((s, i) => view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, s)) * 0x7fff, true))
  return new Blob([view], { type: 'audio/wav' })
}
