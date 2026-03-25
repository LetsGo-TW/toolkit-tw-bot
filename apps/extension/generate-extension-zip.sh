#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd -- "${SCRIPT_DIR}/../.." && pwd)"
SRC_DIR="${SCRIPT_DIR}/dist"
DEFAULT_DEST_DIR="${ROOT_DIR}/apps/api/src/public/downloads"
DEST_DIR="${ZIP_DEST_DIR:-$DEFAULT_DEST_DIR}"

if [ ! -d "$SRC_DIR" ]; then
  echo "[EXT-ZIP] Build não encontrado em: $SRC_DIR" >&2
  echo "[EXT-ZIP] Rode primeiro o build da extensão." >&2
  exit 1
fi

if [ ! -f "${SRC_DIR}/manifest.json" ]; then
  echo "[EXT-ZIP] manifest.json não encontrado em: ${SRC_DIR}/manifest.json" >&2
  echo "[EXT-ZIP] Rode primeiro o build da extensão." >&2
  exit 1
fi

if ! command -v zip >/dev/null 2>&1; then
  echo "[EXT-ZIP] O comando 'zip' não está disponível no ambiente." >&2
  exit 1
fi

EXTENSION_ZIP_BASENAME="$(
  cd "$ROOT_DIR" &&
    node -e "const release = require('./packages/release/src'); console.log(release.extensionZipBasename)"
)"
EXTENSION_ZIP_FILENAME="${EXTENSION_ZIP_BASENAME}.zip"
DEST_ZIP="${DEST_DIR}/${EXTENSION_ZIP_FILENAME}"
TMP_DIR="$(mktemp -d)"
STAGING_DIR="${TMP_DIR}/${EXTENSION_ZIP_BASENAME}"

mkdir -p "$STAGING_DIR"
mkdir -p "$DEST_DIR"
cp -R "${SRC_DIR}/." "$STAGING_DIR/"
touch "$STAGING_DIR"
rm -f "$DEST_ZIP"

echo "[EXT-ZIP] Origem : $SRC_DIR"
echo "[EXT-ZIP] Staging: $STAGING_DIR"
echo "[EXT-ZIP] Destino: $DEST_ZIP"

(
  cd "$TMP_DIR" || exit 1
  zip -rq "$DEST_ZIP" "$EXTENSION_ZIP_BASENAME"
)

rm -rf "$TMP_DIR"

echo "[EXT-ZIP] Ok! Zip gerado em: $DEST_ZIP"
