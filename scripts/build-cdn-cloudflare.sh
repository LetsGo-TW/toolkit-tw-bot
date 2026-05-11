#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
CDN_ENV_FILE="${ROOT_DIR}/apps/cdn/.env"
OUTPUT_DIR="${ROOT_DIR}/apps/cdn/dist-pages"

trim_env_value() {
  local value="$1"

  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"

  if [ "${#value}" -ge 2 ]; then
    local first_char="${value:0:1}"
    local last_char="${value: -1}"

    if [ "$first_char" = '"' ] && [ "$last_char" = '"' ]; then
      value="${value:1:${#value}-2}"
    elif [ "$first_char" = "'" ] && [ "$last_char" = "'" ]; then
      value="${value:1:${#value}-2}"
    fi
  fi

  printf '%s' "$value"
}

load_env_defaults() {
  local env_file="$1"

  if [ ! -f "$env_file" ]; then
    return
  fi

  while IFS= read -r raw_line || [ -n "$raw_line" ]; do
    local line="${raw_line#"${raw_line%%[![:space:]]*}"}"

    if [ -z "$line" ] || [[ "$line" =~ ^# ]]; then
      continue
    fi

    local key="${line%%=*}"

    if [ "$key" = "$line" ]; then
      continue
    fi

    key="$(trim_env_value "$key")"

    if [ -z "$key" ] || [ -n "${!key+x}" ]; then
      continue
    fi

    local value="${line#*=}"
    value="$(trim_env_value "$value")"
    export "$key=$value"
  done < "$env_file"
}

load_env_defaults "$CDN_ENV_FILE"

BUILD_ENV="${CLOUDFLARE_CDN_BUILD_ENV:-prod}"
OBFUSCATE_VALUE="${OBFUSCATE:-}"

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
OBFUSCATE_LABEL="${OBFUSCATE_VALUE:-inherit}"
PUBLIC_BASE_PATH="$(
  cd "$ROOT_DIR" &&
    node -e "const release = require('./packages/release/src'); console.log(release.assetBasePath.replace(/^\/+/, ''))"
)"
TARGET_DIR="${OUTPUT_DIR}/${PUBLIC_BASE_PATH}"

rm -rf "$OUTPUT_DIR"
mkdir -p "$TARGET_DIR"

echo "[BUILD-CDN-CLOUDFLARE] @toolkit-tw-bot/cdn -> ${WORKSPACE_SCRIPT} (OBFUSCATE=${OBFUSCATE_LABEL})"

if [ -n "$OBFUSCATE_VALUE" ]; then
  (
    cd "$ROOT_DIR" || exit 1
    OBFUSCATE="$OBFUSCATE_VALUE" yarn workspace @toolkit-tw-bot/cdn "$WORKSPACE_SCRIPT"
  )
else
  (
    cd "$ROOT_DIR" || exit 1
    yarn workspace @toolkit-tw-bot/cdn "$WORKSPACE_SCRIPT"
  )
fi

cp -R "${ROOT_DIR}/apps/cdn/dist/." "$TARGET_DIR/"

echo "[BUILD-CDN-CLOUDFLARE] Publish dir: ${OUTPUT_DIR}"
echo "[BUILD-CDN-CLOUDFLARE] Public base path: /${PUBLIC_BASE_PATH}"
echo "[BUILD-CDN-CLOUDFLARE] Largest generated assets:"
find "$OUTPUT_DIR" -type f -printf '%s\t%P\n' \
  | sort -nr \
  | head -n 12 \
  | awk '{
      size_mb = $1 / (1024 * 1024);
      printf "  %.2f MiB\t%s\n", size_mb, $2;
    }'
