// Minimal DOM helpers for throwaway spike pages.

export function $(selector: string): HTMLElement {
  const el = document.querySelector<HTMLElement>(selector)
  if (!el) throw new Error(`Missing element ${selector}`)
  return el
}

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> & { class?: string } = {},
  ...children: (Node | string | null | undefined)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag)
  const { class: className, ...rest } = props
  if (className) el.className = className
  Object.assign(el, rest)
  for (const c of children) if (c != null) el.append(c)
  return el
}

export function download(name: string, data: Blob | string, type = 'text/plain') {
  const blob = typeof data === 'string' ? new Blob([data], { type }) : data
  const a = h('a', { href: URL.createObjectURL(blob), download: name })
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

export function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return ''
  const cols = Object.keys(rows[0])
  const cell = (v: unknown) => {
    const s = v == null ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s
  }
  return [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\n')
}

export function pct(n: number, d: number): string {
  return d === 0 ? '—' : `${((100 * n) / d).toFixed(1)}%`
}

export function environment() {
  return {
    userAgent: navigator.userAgent,
    hardwareConcurrency: navigator.hardwareConcurrency,
    deviceMemory: (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? null,
    online: navigator.onLine,
    date: new Date().toISOString(),
  }
}

// Press-and-hold on a button, or hold Space while the page (not a text field)
// has focus. Esc cancels.
export function holdToTalk(
  button: HTMLButtonElement,
  handlers: { start(): void; stop(): void; cancel(): void },
  isActive: () => boolean = () => true,
) {
  let holding = false
  const begin = () => {
    if (holding || button.disabled) return
    holding = true
    handlers.start()
  }
  const end = () => {
    if (!holding) return
    holding = false
    handlers.stop()
  }
  button.addEventListener('pointerdown', (e) => {
    button.setPointerCapture(e.pointerId)
    begin()
  })
  button.addEventListener('pointerup', end)
  button.addEventListener('pointercancel', end)
  const typing = () => {
    const t = document.activeElement
    return t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement
  }
  window.addEventListener('keydown', (e) => {
    if (!isActive()) return
    if (e.key === 'Escape' && holding) {
      holding = false
      handlers.cancel()
    } else if (e.code === 'Space' && !e.repeat && !typing()) {
      e.preventDefault()
      begin()
    }
  })
  window.addEventListener('keyup', (e) => {
    if (isActive() && e.code === 'Space' && !typing()) end()
  })
}
