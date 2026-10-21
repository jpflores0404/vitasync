import Dexie, { type EntityTable } from 'dexie'
import { $, download, environment, h } from '../shared/ui'

interface SpikeRecord {
  id: string
  pulse: number | null
  systolic: number | null
  diastolic: number | null
  temperature: number | null
  respiratoryRate: number | null
  spo2: number | null
  measuredAt: string
}

const db = new Dexie('vitasync-spike') as Dexie & { records: EntityTable<SpikeRecord, 'id'> }
db.version(1).stores({ records: 'id, measuredAt' })

const log = (line: string) => ($('#db-log').textContent = `${new Date().toLocaleTimeString()} ${line}\n${$('#db-log').textContent}`)

async function checks(): Promise<[string, string, 'ok' | 'bad' | 'warn' | ''][]> {
  const estimate = await navigator.storage?.estimate?.()
  const persisted = await navigator.storage?.persisted?.()
  const dbs = (await indexedDB.databases?.()) ?? []
  const cacheNames = 'caches' in window ? await caches.keys() : []
  const cacheSizes = await Promise.all(cacheNames.map(async (n) => `${n} (${(await (await caches.open(n)).keys()).length})`))
  const standalone = matchMedia('(display-mode: standalone)').matches
  const mb = (b?: number) => (b == null ? '?' : `${(b / 1024 / 1024).toFixed(1)} MB`)
  return [
    ['Secure context', String(isSecureContext), isSecureContext ? 'ok' : 'bad'],
    ['Online', String(navigator.onLine), ''],
    ['Service worker controlling page', String(!!navigator.serviceWorker?.controller), navigator.serviceWorker?.controller ? 'ok' : 'warn'],
    ['Running as installed app', String(standalone), standalone ? 'ok' : 'warn'],
    ['Persistent storage granted', String(persisted), persisted ? 'ok' : 'warn'],
    ['Storage used / quota', `${mb(estimate?.usage)} / ${mb(estimate?.quota)}`, ''],
    ['IndexedDB databases', dbs.map((d) => d.name).join(', ') || '—', ''],
    ['Vosk model cache (IDBFS "/vosk")', dbs.some((d) => d.name === '/vosk') ? 'present' : 'absent', dbs.some((d) => d.name === '/vosk') ? 'ok' : 'warn'],
    ['Cache Storage', cacheSizes.join(', ') || '—', ''],
    ['Spike records stored', String(await db.records.count()), ''],
  ]
}

async function render() {
  const rows = await checks()
  $('#checks tbody').replaceChildren(...rows.map(([k, v, cls]) => h('tr', {}, h('th', {}, k), h('td', { class: cls }, v))))
}

$('#refresh').addEventListener('click', render)
$('#persist').addEventListener('click', async () => {
  const granted = await navigator.storage?.persist?.()
  log(`persist() → ${granted}`)
  render()
})
$('#copy').addEventListener('click', async () => {
  download(`pwa-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ environment: environment(), checks: await checks() }, null, 2), 'application/json')
})

const rand = (min: number, max: number, dp = 0) => Number((min + Math.random() * (max - min)).toFixed(dp))

$('#write').addEventListener('click', async () => {
  const t0 = performance.now()
  await db.records.bulkAdd(
    Array.from({ length: 500 }, () => ({
      id: crypto.randomUUID(),
      pulse: rand(55, 110),
      systolic: rand(95, 150),
      diastolic: rand(55, 95),
      temperature: rand(36, 38.5, 1),
      respiratoryRate: rand(12, 24),
      spo2: Math.random() < 0.1 ? null : rand(93, 100),
      measuredAt: new Date().toISOString(),
    })),
  )
  log(`Wrote 500 records in ${Math.round(performance.now() - t0)} ms (online: ${navigator.onLine})`)
  render()
})
$('#read').addEventListener('click', async () => {
  const t0 = performance.now()
  const all = await db.records.toArray()
  log(`Read ${all.length} records in ${Math.round(performance.now() - t0)} ms (online: ${navigator.onLine})`)
})
$('#clear').addEventListener('click', async () => {
  await db.delete()
  log('Deleted spike database. Reload the page to recreate it.')
  render()
})

window.addEventListener('online', render)
window.addEventListener('offline', render)
render()
