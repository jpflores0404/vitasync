// Runs the ASR spike's batch scoring headlessly in installed Chrome against a
// folder of clips, for every model × grammar configuration, then repeats one
// configuration with the network disabled.
//
//   pnpm spike:build
//   node spikes/scripts/asr-batch.mjs <clips-dir> [out-dir]
//
// Clip names must follow <speaker>_<mic>_<noise>_<phraseId>_<take>.wav.

import { spawn } from 'node:child_process'
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { chromium } from '@playwright/test'

const [clipsDir, outDir = 'spikes/asr/results'] = process.argv.slice(2)
if (!clipsDir) {
  console.error('usage: node spikes/scripts/asr-batch.mjs <clips-dir> [out-dir]')
  process.exit(1)
}
const clips = readdirSync(clipsDir).filter((f) => f.endsWith('.wav')).map((f) => path.resolve(clipsDir, f))
mkdirSync(outDir, { recursive: true })

const PORT = 4173
const server = spawn('pnpm', ['exec', 'vite', 'preview', '--config', 'spikes/vite.config.ts', '--port', String(PORT), '--strictPort'], {
  stdio: 'pipe',
})
await new Promise((resolve, reject) => {
  server.stdout.on('data', (d) => String(d).includes(String(PORT)) && resolve())
  server.on('exit', (code) => reject(new Error(`preview exited ${code}`)))
})

const browser = await chromium.launch({ channel: 'chrome' })
const context = await browser.newContext({ acceptDownloads: true })
const page = await context.newPage()
const vocabWarnings = new Set()
page.on('console', (m) => {
  const match = /missing in vocabulary:?\s*'?([^'\s]+)/i.exec(m.text())
  if (match) vocabWarnings.add(match[1])
})

async function loadModel(model) {
  await page.selectOption('#model', model)
  await page.click('#load')
  await page.waitForFunction(() => /Loaded|Failed/.test(document.querySelector('#load-status')?.textContent ?? ''), null, { timeout: 180_000 })
  const status = await page.textContent('#load-status')
  if (status.startsWith('Failed')) throw new Error(status)
  return status
}

async function runBatch(label, files) {
  await page.click('[data-tab="batch"]')
  await page.setInputFiles('#clips', files)
  await page.click('#run-batch')
  await page.waitForSelector('#summary', { timeout: 600_000 })
  const download = page.waitForEvent('download')
  await page.click('#dl-json')
  const file = path.join(outDir, `${label}.json`)
  await (await download).saveAs(file)
  const summary = await page.$$eval('#summary tbody tr', (rows) => rows.map((r) => [...r.children].map((c) => c.textContent)))
  console.log(`\n== ${label}`)
  for (const row of summary) console.log(row.join(' | '))
  return file
}

try {
  await page.goto(`http://localhost:${PORT}/asr/`)
  // Second load so the service worker controls the page before going offline.
  await page.waitForFunction(() => navigator.serviceWorker?.ready.then(() => true), null, { timeout: 30_000 })
  await page.reload()

  for (const model of ['en-us', 'en-in']) {
    const status = await loadModel(model)
    console.log(`\n${status}`)
    for (const grammar of ['full', 'no-letters', 'off']) {
      for (const pad of [false, true]) {
        await page.selectOption('#grammar', grammar)
        await page.setChecked('#pad', pad)
        await runBatch(`${model}-grammar-${grammar}-leadin-${pad ? 'on' : 'off'}`, clips)
      }
    }
  }

  // Offline: reload from the service worker, load the model from IndexedDB, recognise.
  await context.setOffline(true)
  await page.reload()
  const offlineStatus = await loadModel('en-us')
  console.log(`\nOFFLINE: ${offlineStatus}`)
  await page.click('[data-tab="batch"]')
  await page.selectOption('#grammar', 'full')
  await page.setChecked('#pad', true)
  await runBatch('offline-en-us-grammar-full-leadin-on', clips)
  await context.setOffline(false)

  writeFileSync(path.join(outDir, 'vocabulary-warnings.json'), JSON.stringify([...vocabWarnings].sort(), null, 2))
  console.log(`\nGrammar words missing from model vocabulary: ${[...vocabWarnings].sort().join(', ') || 'none reported'}`)
} finally {
  await browser.close()
  server.kill()
}
