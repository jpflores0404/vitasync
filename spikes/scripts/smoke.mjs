// Automated smoke checks for Spikes 2 and 3 in installed Chrome (headless).
// These prove the pipelines run; they are NOT feasibility evidence for real
// device photos, which must be collected and scored by hand.
//
//   pnpm spike:build && node spikes/scripts/smoke.mjs [out-dir]

import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { chromium } from '@playwright/test'

const outDir = process.argv[2] ?? 'spikes/smoke-results'
const imgDir = path.join(outDir, 'synthetic-displays')
mkdirSync(imgDir, { recursive: true })
const PORT = 4174
const base = `http://localhost:${PORT}`

const server = spawn('pnpm', ['exec', 'vite', 'preview', '--config', 'spikes/vite.config.ts', '--port', String(PORT), '--strictPort'], { stdio: 'pipe' })
await new Promise((resolve, reject) => {
  server.stdout.on('data', (d) => String(d).includes(String(PORT)) && resolve())
  server.on('exit', (code) => reject(new Error(`preview exited ${code}`)))
})

// ── Synthetic seven-segment displays ────────────────────────────────────
const SEGMENTS = { 0: 'abcdef', 1: 'bc', 2: 'abdeg', 3: 'abcdg', 4: 'bcfg', 5: 'acdfg', 6: 'acdefg', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg' }
function sevenSegmentSvg(text, { fg, bg }) {
  const W = 60, H = 110, T = 12, gap = 18
  const seg = {
    a: [T, 0, W - 2 * T, T], d: [T, H - T, W - 2 * T, T], g: [T, (H - T) / 2, W - 2 * T, T],
    b: [W - T, T, T, (H - 3 * T) / 2], c: [W - T, (H + T) / 2, T, (H - 3 * T) / 2],
    f: [0, T, T, (H - 3 * T) / 2], e: [0, (H + T) / 2, T, (H - 3 * T) / 2],
  }
  let x = 30
  const parts = []
  for (const ch of text) {
    if (ch === '.') {
      parts.push(`<rect x="${x - gap / 2 - 6}" y="${30 + H - T}" width="${T}" height="${T}" fill="${fg}"/>`)
      continue
    }
    for (const s of SEGMENTS[ch]) {
      const [sx, sy, sw, sh] = seg[s]
      parts.push(`<rect x="${x + sx}" y="${30 + sy}" width="${sw}" height="${sh}" rx="3" fill="${fg}"/>`)
    }
    x += W + gap
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${x + 30}" height="${H + 60}"><rect width="100%" height="100%" fill="${bg}"/>${parts.join('')}</svg>`
}

const LCD = { fg: '#1f2a1f', bg: '#b8c4b0' }
const LED = { fg: '#ff3b30', bg: '#0b0b0b' }
const displays = [
  ['thermo_36.7_01.png', '36.7', LCD], ['thermo_38.5_02.png', '38.5', LCD], ['thermo_37.0_03.png', '37.0', LCD],
  ['oxi_98_04.png', '98', LED], ['oxi_76_05.png', '76', LED], ['oxi_100_06.png', '100', LED],
]

const browser = await chromium.launch({ channel: 'chrome' })
const report = { ocr: [], pwa: {} }
try {
  const page = await browser.newPage()
  const files = []
  for (const [name, text, style] of displays) {
    await page.setContent(`<body style="margin:0">${sevenSegmentSvg(text, style)}</body>`)
    const file = path.join(imgDir, name)
    await page.locator('svg').screenshot({ path: file })
    files.push(file)
  }

  // ── Spike 2: OCR ──────────────────────────────────────────────────────
  await page.goto(`${base}/ocr/`)
  await page.setInputFiles('#files', files)
  for (const lang of ['ssd_int', 'eng']) {
    for (const close of [false, true]) {
      await page.selectOption('#lang', lang)
      await page.setChecked('#close', close)
      for (let i = 0; i < files.length; i++) {
        await page.waitForFunction((n) => document.querySelector('#pos')?.textContent?.startsWith(`${n} /`), i + 1)
        const before = await page.locator('#results tbody tr').count()
        await page.click('#run')
        await page.waitForFunction((n) => document.querySelectorAll('#results tbody tr').length > n, before, { timeout: 120_000 })
        const cells = await page.locator('#results tbody tr').first().locator('td').allTextContents()
        report.ocr.push({ image: cells[0], settings: cells[1], text: cells[2], expected: cells[4], exact: cells[5], ignoringDecimal: cells[6], ms: Number(cells[7]) })
        await page.click('#next')
      }
      // Back to the first image for the next configuration.
      for (let i = 0; i < files.length; i++) await page.click('#prev')
    }
  }
  console.log('\nOCR (synthetic 7-segment renders, full image, no crop)')
  const groups = Object.groupBy(report.ocr, (r) => r.settings.replace(/ cropped/, '').split(' ').filter((p) => !p.startsWith('h')).join(' '))
  for (const [settings, rows] of Object.entries(groups)) {
    const exact = rows.filter((r) => r.exact === 'yes').length
    console.log(`${settings}: exact ${exact}/${rows.length} · ${rows.map((r) => `${r.expected}→"${r.text}"`).join('  ')}`)
  }

  // ── Spike 3: offline PWA and storage ──────────────────────────────────
  const context = await browser.newContext()
  const pwa = await context.newPage()
  await pwa.goto(`${base}/pwa/`)
  await pwa.waitForFunction(() => navigator.serviceWorker?.ready.then(() => true))
  await pwa.reload()
  await pwa.click('#write')
  await pwa.waitForFunction(() => document.querySelector('#db-log')?.textContent?.includes('Wrote 500'))
  const reads = () => pwa.evaluate(() => (document.querySelector('#db-log')?.textContent?.match(/Read \d+ records/g) ?? []).length)
  const read = async () => {
    const n = await reads()
    await pwa.click('#read')
    await pwa.waitForFunction((n) => (document.querySelector('#db-log')?.textContent?.match(/Read \d+ records/g) ?? []).length > n, n)
    return pwa.evaluate(() => /Read (\d+) records in (\d+) ms/.exec(document.querySelector('#db-log').textContent).slice(1).map(Number))
  }
  const checks = async () => Object.fromEntries(await pwa.$$eval('#checks tr', (rows) => rows.map((r) => [r.children[0].textContent, r.children[1].textContent])))
  const [countOnline, readMsOnline] = await read()
  const writeMs = await pwa.evaluate(() => Number(/Wrote 500 records in (\d+) ms/.exec(document.querySelector('#db-log').textContent)[1]))

  await context.setOffline(true)
  await pwa.reload()
  await pwa.waitForSelector('#checks tr')
  const [countOffline, readMsOffline] = await read()
  await pwa.click('#write')
  await pwa.waitForFunction(() => document.querySelector('#db-log')?.textContent?.includes('online: false'))
  const [countAfterOfflineWrite] = await read()
  const offlineChecks = await checks()
  await context.setOffline(false)

  // Offline OCR: run once online so Tesseract assets are cached, then again offline.
  const ocrPage = await context.newPage()
  const runOcr = async () => {
    await ocrPage.goto(`${base}/ocr/`)
    await ocrPage.setInputFiles('#files', files[1])
    await ocrPage.setChecked('#close', true)
    await ocrPage.click('#run')
    await ocrPage.waitForSelector('#results tbody tr', { timeout: 120_000 })
    return ocrPage.locator('#results tbody tr').first().locator('td').nth(2).textContent()
  }
  const ocrOnline = await runOcr()
  await context.setOffline(true)
  const ocrOffline = await runOcr().catch((e) => `FAILED: ${String(e).split('\n')[0]}`)
  await context.setOffline(false)

  report.pwa = { writeMs, countOnline, readMsOnline, countOffline, readMsOffline, countAfterOfflineWrite, offlineChecks, ocrOnline, ocrOffline }
  console.log('\nPWA / storage')
  console.log(JSON.stringify(report.pwa, null, 2))
} finally {
  writeFileSync(path.join(outDir, 'smoke-report.json'), JSON.stringify(report, null, 2))
  await browser.close()
  server.kill()
}
