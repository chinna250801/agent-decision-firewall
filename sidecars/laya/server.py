"""Reference Laya sidecar.

Wraps the Apache-2.0 `laya` package (convaiinnovations/laya) in a tiny HTTP API
so the TypeScript firewall can evaluate against Laya locally.

Run:
    pip install laya
    LAYA_SIDECAR_URL=http://127.0.0.1:8770

Endpoint: POST /predict  { checkpoint, state, questions } -> { model, answers }
Question schema is identical to TypeSafe Jev's (noul / score / choice), so both
adapters share one question registry and one state format.
"""
from http.server import BaseHTTPRequestHandler, HTTPServer
import json
import os

CHECKPOINTS = {
    "english": "convaiinnovations/laya",
    "multilingual": ("convaiinnovations/laya", "multilingual"),
    "typed-decisions": ("convaiinnovations/laya", "typed-decisions"),
}

_preloaded = {}

def _load(name):
    if name not in _preloaded:
        import laya

        target = CHECKPOINTS[name]
        if isinstance(target, tuple):
            _preloaded[name] = laya.load(target[0], subfolder=target[1])
        else:
            _preloaded[name] = laya.load(target)
    return _preloaded[name]

def _f(x, default=0.0):
    try:
        return float(x)
    except (TypeError, ValueError):
        return default

def _answer(a):
    # Normalize the sidecar response to the same shape Jev returns.
    t = a.get("type")
    if t == "noul":
        return {"type": "noul", "noul": _f(a.get("noul"))}
    if t == "score":
        return {"type": "score", "score": _f(a.get("score")),
                "probabilities": a.get("probabilities", {}),
                "confidence": _f(a.get("confidence"), 1.0)}
    if t == "choice":
        return {"type": "choice", "choice": a.get("choice"),
                "probabilities": a.get("probabilities", {}),
                "confidence": _f(a.get("confidence"), 1.0)}
    raise ValueError(f"unknown answer type: {t!r}")

class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        if self.path != "/predict":
            self.send_error(404)
            return
        try:
            req = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
            agent = _load(req.get("checkpoint", os.environ.get("LAYA_CHECKPOINT", "english")))
            result = agent.predict(req["state"], req["questions"])
            body = json.dumps({
                "model": f"laya-{req.get('checkpoint', 'english')}",
                "answers": {k: _answer(v) for k, v in result["answers"].items()},
            }).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(body)
        except Exception as e:  # noqa: BLE001 - sidecar must answer with an error, not die
            self.send_response(500)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(e)}).encode())

if __name__ == "__main__":
    port = int(os.environ.get("LAYA_SIDECAR_PORT", "8770"))
    preload = os.environ.get("LAYA_PRELOAD", "english")
    for name in preload.split(","):
        if name.strip():
            _load(name.strip())
    print(f"laya sidecar on http://127.0.0.1:{port} (preloaded: {preload})")
    HTTPServer(("127.0.0.1", port), Handler).serve_forever()
