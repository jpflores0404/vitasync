// Thin wrapper around @lichess-org/vosk-browser for the spike.
// The worker answers every audio chunk with exactly one result/partialresult
// event, so the final result is the event after all chunks have been answered.

import { createVoskClient, type RecognizerMessage, type VoskClient } from '@lichess-org/vosk-browser'
import wasmUrl from '@lichess-org/vosk-browser/dist/vosk.wasm?url'
import workerUrl from '@lichess-org/vosk-browser/dist/vosk.worker.js?url'

export const MODELS = {
  'en-us': '/models/vosk-model-small-en-us-0.15.tar.gz',
  'en-in': '/models/vosk-model-small-en-in-0.4.tar.gz',
} as const
export type ModelId = keyof typeof MODELS

export async function loadVosk(model: ModelId): Promise<VoskClient> {
  return createVoskClient({ modelUrl: MODELS[model], workerUrl, wasmUrl, logLevel: 0 })
}

export class VoskSession {
  private recognizer: InstanceType<VoskClient['KaldiRecognizer']>
  private sent = 0
  private answered = 0
  private texts: string[] = []
  private finish?: { expected: number; resolve: (text: string) => void }

  constructor(
    client: VoskClient,
    sampleRate: number,
    grammar: string[] | null,
    onPartial?: (text: string) => void,
  ) {
    this.recognizer = new client.KaldiRecognizer(sampleRate, grammar ? JSON.stringify(grammar) : undefined)
    this.recognizer.on('result', (m: RecognizerMessage) => {
      if (m.event !== 'result') return
      this.answered++
      if (m.result.text) this.texts.push(m.result.text)
      onPartial?.(this.texts.join(' '))
      this.settle()
    })
    this.recognizer.on('partialresult', (m: RecognizerMessage) => {
      if (m.event !== 'partialresult') return
      this.answered++
      onPartial?.([...this.texts, m.result.partial].filter(Boolean).join(' '))
      this.settle()
    })
  }

  feed(samples: Float32Array, sampleRate: number) {
    this.recognizer.acceptWaveformFloat(samples, sampleRate)
    this.sent++
  }

  // Resolves with the full transcript of everything fed so far.
  end(): Promise<string> {
    return new Promise((resolve) => {
      this.finish = { expected: this.sent + 1, resolve }
      this.recognizer.retrieveFinalResult()
    })
  }

  dispose() {
    this.recognizer.remove()
  }

  private settle() {
    if (this.finish && this.answered >= this.finish.expected) {
      const { resolve } = this.finish
      this.finish = undefined
      resolve(this.texts.join(' ').trim())
    }
  }
}
