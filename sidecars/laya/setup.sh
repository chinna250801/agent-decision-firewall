#!/usr/bin/env bash
# Reproducible local Laya setup (Python 3.12, uv-managed venv).
# Usage: bash sidecars/laya/setup.sh          # create venv + install
#        bash sidecars/laya/setup.sh boot    # also start the sidecar
set -euo pipefail
cd "$(dirname "$0")/../.."

if [ ! -x .venv/bin/python ] || [ "$(.venv/bin/python --version 2>&1)" != *"3.12"* ]; then
  echo ">> creating .venv with Python 3.12 (uv)"
  rm -rf .venv
  uv venv --python 3.12 .venv
fi

echo ">> installing laya (cached after first run)"
uv pip install --python .venv/bin/python laya

echo ">> import check"
./.venv/bin/python -c "import laya; print('laya OK')"

if [ "${1:-}" = "boot" ]; then
  echo ">> booting sidecar on :8770 (preloading english checkpoint; first boot downloads ~800MB)"
  USE_TF=0 LAYA_PRELOAD=english ./.venv/bin/python sidecars/laya/server.py
fi
