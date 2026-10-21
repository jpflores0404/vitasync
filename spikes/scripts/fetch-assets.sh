#!/usr/bin/env bash
# Downloads speech models and OCR data for the Phase 0 spikes into
# spikes/public/ (gitignored). Safe to re-run; existing files are skipped.
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$(pwd)/.."
PUBLIC="$(pwd)/public"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$PUBLIC/models" "$PUBLIC/tesseract/lang"

# vosk-browser loads models as .tar.gz with one top-level folder.
fetch_vosk_model() {
  local name="$1"
  local out="$PUBLIC/models/$name.tar.gz"
  [[ -f "$out" ]] && { echo "✓ $name"; return; }
  echo "↓ $name"
  curl -fL --progress-bar -o "$TMP/$name.zip" "https://alphacephei.com/vosk/models/$name.zip"
  unzip -q "$TMP/$name.zip" -d "$TMP"
  tar -czf "$out" -C "$TMP" "$name"
}

fetch() {
  local url="$1" out="$2"
  [[ -f "$out" ]] && { echo "✓ $(basename "$out")"; return; }
  echo "↓ $(basename "$out")"
  curl -fL --progress-bar -o "$out" "$url"
}

fetch_vosk_model vosk-model-small-en-us-0.15
fetch_vosk_model vosk-model-small-en-in-0.4

# Tesseract.js fetches <lang>.traineddata.gz from langPath.
# ssd_int: seven-segment display data, Apache-2.0 (github.com/Shreeshrii/tessdata_ssd).
if [[ ! -f "$PUBLIC/tesseract/lang/ssd_int.traineddata.gz" ]]; then
  fetch https://github.com/Shreeshrii/tessdata_ssd/raw/master/ssd_int.traineddata "$TMP/ssd_int.traineddata"
  gzip -c "$TMP/ssd_int.traineddata" > "$PUBLIC/tesseract/lang/ssd_int.traineddata.gz"
fi
fetch https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz \
  "$PUBLIC/tesseract/lang/eng.traineddata.gz"

# Self-host the Tesseract worker and WASM core so OCR works offline.
CORE="$(dirname "$(node -p "require.resolve('tesseract.js-core/package.json', { paths: [require.resolve('tesseract.js')] })" 2>/dev/null || true)")"
[[ -d "$CORE" ]] || { echo "tesseract.js-core not found — run pnpm install" >&2; exit 1; }
cp "$ROOT/node_modules/tesseract.js/dist/worker.min.js" "$PUBLIC/tesseract/"
cp "$CORE"/tesseract-core*.js "$CORE"/tesseract-core*.wasm "$PUBLIC/tesseract/"

echo "Done. Assets in spikes/public/"
