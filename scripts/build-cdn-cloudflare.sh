#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
OUTPUT_DIR="${ROOT_DIR}/apps/cdn/dist-pages"
BUILD_ENV="${CLOUDFLARE_CDN_BUILD_ENV:-prod}"
OBFUSCATE_VALUE="${OBFUSCATE:-false}"

usage() {
  cat <<'EOF'
Uso:
  scripts/build-cdn-cloudflare.sh

Variáveis opcionais:
  CLOUDFLARE_CDN_BUILD_ENV=dev|prod-local|prod
  OBFUSCATE=true|false

Saída:
  apps/cdn/dist-pages/cdn/<compatVersion>/{web,workers}
EOF
}

case "$BUILD_ENV" in
  dev|prod-local|prod)
    ;;
  *)
    echo "[BUILD-CDN-CLOUDFLARE] Ambiente inválido: $BUILD_ENV" >&2
    usage
    exit 1
    ;;
esac

WORKSPACE_SCRIPT="build:${BUILD_ENV}"
PUBLIC_BASE_PATH="$(
  cd "$ROOT_DIR" &&
    node -e "const release = require('./packages/release/src'); console.log(release.assetBasePath.replace(/^\/+/, ''))"
)"
TARGET_DIR="${OUTPUT_DIR}/${PUBLIC_BASE_PATH}"

rm -rf "$OUTPUT_DIR"
mkdir -p "$TARGET_DIR"

echo "[BUILD-CDN-CLOUDFLARE] @toolkit-tw-bot/cdn -> ${WORKSPACE_SCRIPT} (OBFUSCATE=${OBFUSCATE_VALUE})"
(
  cd "$ROOT_DIR" || exit 1
  OBFUSCATE="$OBFUSCATE_VALUE" yarn workspace @toolkit-tw-bot/cdn "$WORKSPACE_SCRIPT"
)

cp -R "${ROOT_DIR}/apps/cdn/dist/." "$TARGET_DIR/"

echo "[BUILD-CDN-CLOUDFLARE] Publish dir: ${OUTPUT_DIR}"
echo "[BUILD-CDN-CLOUDFLARE] Public base path: /${PUBLIC_BASE_PATH}"
