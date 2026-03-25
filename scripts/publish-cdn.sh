#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
SRC_DIR="${ROOT_DIR}/apps/cdn/dist"
API_PUBLIC_CDN_DIR="${API_CDN_DIR:-${ROOT_DIR}/apps/api/src/public/cdn}"
TARGET=""
EXTERNAL_CDN_DIR="${CDN_PUBLISH_DIR:-}"

usage() {
  cat <<'EOF'
Uso:
  scripts/publish-cdn.sh [--target=api|cdn|both] [--cdn-dir=/destino/local/do/cdn]

Observações:
  --target=api   copia para apps/api/src/public/cdn/<compatVersion>
  --target=cdn   copia para <cdn-dir>/<compatVersion>
  --target=both  publica nos dois destinos

Se nenhum target for informado, o script pergunta interativamente.
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --target=api|--target=cdn|--target=both)
      TARGET="${1#--target=}"
      ;;
    --target)
      shift
      TARGET="${1:-}"
      ;;
    --cdn-dir=*)
      EXTERNAL_CDN_DIR="${1#--cdn-dir=}"
      ;;
    --cdn-dir)
      shift
      EXTERNAL_CDN_DIR="${1:-}"
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "[PUBLISH-CDN] Argumento inválido: $1" >&2
      usage
      exit 1
      ;;
  esac
  shift
done

if [ -z "$TARGET" ]; then
  echo
  echo "[PUBLISH-CDN] Destino da publicação do CDN:"
  echo "[PUBLISH-CDN] 1) API local/origin"
  echo "[PUBLISH-CDN] 2) diretório do CDN"
  echo "[PUBLISH-CDN] 3) ambos"
  read -r -p "[PUBLISH-CDN] Escolha 1, 2 ou 3: " answer

  case "$answer" in
    1) TARGET="api" ;;
    2) TARGET="cdn" ;;
    3) TARGET="both" ;;
    *)
      echo "[PUBLISH-CDN] Opção inválida." >&2
      exit 1
      ;;
  esac
fi

if [ ! -d "$SRC_DIR" ]; then
  echo "[PUBLISH-CDN] Build do CDN não encontrado em: $SRC_DIR" >&2
  echo "[PUBLISH-CDN] Rode primeiro scripts/build-assets.sh --only=cdn" >&2
  exit 1
fi

COMPAT_VERSION="$(
  cd "$ROOT_DIR" &&
    node -e "const release = require('./packages/release/src'); console.log(release.compatVersion)"
)"
PUBLIC_BASE_PATH="$(
  cd "$ROOT_DIR" &&
    node -e "const release = require('./packages/release/src'); console.log(release.assetBasePath)"
)"
API_TARGET_DIR="${API_PUBLIC_CDN_DIR}/${COMPAT_VERSION}"

copy_dist_to_target() {
  local destination="$1"

  mkdir -p "$(dirname "$destination")"
  rm -rf "$destination"
  mkdir -p "$destination"
  cp -R "${SRC_DIR}/." "$destination/"
}

case "$TARGET" in
  api|cdn|both)
    ;;
  *)
    echo "[PUBLISH-CDN] Target inválido: $TARGET" >&2
    usage
    exit 1
    ;;
esac

if [ "$TARGET" = "api" ] || [ "$TARGET" = "both" ]; then
  copy_dist_to_target "$API_TARGET_DIR"
  echo "[PUBLISH-CDN] API origin atualizada em: $API_TARGET_DIR"
fi

if [ "$TARGET" = "cdn" ] || [ "$TARGET" = "both" ]; then
  if [ -z "$EXTERNAL_CDN_DIR" ]; then
    echo "[PUBLISH-CDN] Defina --cdn-dir ou CDN_PUBLISH_DIR para publicar no CDN." >&2
    exit 1
  fi

  EXTERNAL_TARGET_DIR="${EXTERNAL_CDN_DIR%/}/${COMPAT_VERSION}"
  copy_dist_to_target "$EXTERNAL_TARGET_DIR"
  echo "[PUBLISH-CDN] Diretório do CDN atualizado em: $EXTERNAL_TARGET_DIR"
fi

echo "[PUBLISH-CDN] Caminho público esperado dos scripts: ${PUBLIC_BASE_PATH}"
