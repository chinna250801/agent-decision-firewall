#!/usr/bin/env bash
# Boot the local Laya sidecar and wait for READY. Weights must be cached
# (run sidecars/laya/setup.sh boot once with network). Env vars force offline
# mode so huggingface_hub never phones home.
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1
export USE_TF=0 HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1 LAYA_PRELOAD=english
./.venv/bin/python sidecars/laya/server.py > /tmp/laya-browse.log 2>&1 &
echo $! > /tmp/laya-sidecar.pid
for i in $(seq 1 90); do
  grep -q "READY" /tmp/laya-browse.log 2>/dev/null && { echo "sidecar ready (pid $(cat /tmp/laya-sidecar.pid))"; exit 0; }
  sleep 1
done
echo "SIDECAR_FAILED"; tail -5 /tmp/laya-browse.log; exit 1
