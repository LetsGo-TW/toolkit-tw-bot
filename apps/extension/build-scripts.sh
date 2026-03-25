#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd -- "${SCRIPT_DIR}/../.." && pwd)"

if [ "$#" -eq 0 ]; then
  exec "${ROOT_DIR}/scripts/build-assets.sh" --only=extension
fi

exec "${ROOT_DIR}/scripts/build-assets.sh" "$@"
