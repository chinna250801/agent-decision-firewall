#!/usr/bin/env bash
# Records the firewall+Laya demo end-to-end:
#   boot sidecar -> asciinema rec (scripted real session) -> agg -> ffmpeg -> mp4
# Outputs (gitignored): demo/firewall-laya-demo.mp4 + .gif
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1
ROOT="$PWD"

echo "== booting Laya sidecar =="
USE_TF=0 LAYA_PRELOAD=english ./.venv/bin/python sidecars/laya/server.py > /tmp/laya-demo.log 2>&1 &
SPID=$!
trap 'kill $SPID 2>/dev/null' EXIT
for i in $(seq 1 45); do sleep 2; grep -q READY /tmp/laya-demo.log && break; done
grep -q READY /tmp/laya-demo.log || { echo "sidecar failed"; tail -5 /tmp/laya-demo.log; exit 1; }
echo "sidecar ready"

# The recorded session: a real user working in the dummy repo, every action gated.
SESSION=$ROOT/demo/record-session.sh
chmod +x "$SESSION"
CAST=/tmp/firewall-demo.cast

echo "== recording terminal session =="
./.venv/bin/asciinema rec --quiet --overwrite "$CAST" --command "$SESSION" 2>/dev/null
ls -la "$CAST" || exit 1

echo "== rendering GIF (agg) =="
agg --cols 110 --rows 38 --font-size 15 --speed 1 "$CAST" demo/firewall-laya-demo.gif
ls -la demo/firewall-laya-demo.gif || exit 1

echo "== converting to MP4 (ffmpeg) =="
# scale to even dimensions: libx264 requires even width/height
ffmpeg -y -loglevel error -i demo/firewall-laya-demo.gif \
  -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2" \
  -movflags faststart -pix_fmt yuv420p -r 30 \
  demo/firewall-laya-demo.mp4
ls -la demo/firewall-laya-demo.mp4 && echo "RECORDING COMPLETE"
