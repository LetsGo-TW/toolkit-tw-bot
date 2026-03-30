#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
BUILD_ENV="prod"
BUILD_CDN=true
BUILD_EXTENSION=true

usage() {
  cat <<'EOF'
Uso:
  scripts/build-assets.sh [--env=dev|prod-local|prod] [--only=cdn|extension|all]

Exemplos:
  scripts/build-assets.sh
  scripts/build-assets.sh --env=dev
  scripts/build-assets.sh --env=prod-local
  scripts/build-assets.sh --only=extension
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --env=dev)
      BUILD_ENV="dev"
      ;;
    --env=prod-local)
      BUILD_ENV="prod-local"
      ;;
    --env=prod)
      BUILD_ENV="prod"
      ;;
    --env)
      shift
      BUILD_ENV="${1:-}"
      ;;
    --only=cdn)
      BUILD_CDN=true
      BUILD_EXTENSION=false
      ;;
    --only=extension)
      BUILD_CDN=false
      BUILD_EXTENSION=true
      ;;
    --only=all)
      BUILD_CDN=true
      BUILD_EXTENSION=true
      ;;
    --only)
      shift
      case "${1:-}" in
        cdn)
          BUILD_CDN=true
          BUILD_EXTENSION=false
          ;;
        extension)
          BUILD_CDN=false
          BUILD_EXTENSION=true
          ;;
        all)
          BUILD_CDN=true
          BUILD_EXTENSION=true
          ;;
        *)
          echo "[BUILD-ASSETS] Valor inválido para --only: ${1:-}" >&2
          usage
          exit 1
          ;;
      esac
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "[BUILD-ASSETS] Argumento inválido: $1" >&2
      usage
      exit 1
      ;;
  esac
  shift
done

case "$BUILD_ENV" in
  dev|prod-local|prod)
    ;;
  *)
    echo "[BUILD-ASSETS] Ambiente inválido: $BUILD_ENV" >&2
    usage
    exit 1
    ;;
esac

run_workspace_build() {
  local workspace="$1"
  local script_name="build:${BUILD_ENV}"

  echo "[BUILD-ASSETS] ${workspace} -> ${script_name}"
  (
    cd "$ROOT_DIR" || exit 1
    yarn workspace "$workspace" "$script_name"
  )
}

if [ "$BUILD_CDN" = true ]; then
  run_workspace_build "@toolkit-tw-bot/cdn"
fi

if [ "$BUILD_EXTENSION" = true ]; then
  run_workspace_build "@toolkit-tw-bot/extension"
fi

echo "[BUILD-ASSETS] Artefatos concluídos para env=${BUILD_ENV}"
