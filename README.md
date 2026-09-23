# AI Agent Decision Firewall & Evaluation Harness

A production-oriented, **model-agnostic decision firewall** for AI agents.
It sits between an agent and every tool/action it wants to execute. Core invariant:

> **No approval → no execution.**

The decision model is pluggable. Initial adapters: **Jev** (TypeSafe AI, closed API)
and **Laya** (Convai Innovations, Apache-2.0 open weights). The firewall, policy
engine, evaluator, and test suite never know which model is active — switching
models is a config/CLI/env change, never a code change.

## Research: the two decision models

**Jev (TypeSafe AI)** — a closed, hosted "System One" model (`jev-latest`).
It does not generate text: it takes a state plus typed questions and returns
typed answers — `noul` (0–1 yes/no probability), `score` (probability-weighted
rubric level), `choice` (option + full distribution + confidence). Endpoint:
`POST https://api.typesafe.ai/v1/systemone`. Independently measured p50 ≈ 236–276 ms.
Strengths: high-cardinality choices (up to 255 options), soft distribution quality.
Weakness: closed weights, paid API, raw calibration lags post-temperature competitors.

**Laya (Convai Innovations)** — the open alternative: Apache-2.0 weights on
Hugging Face (`convaiinnovations/laya`), 421M params (ModernBERT-large + decision
head), non-autoregressive single forward pass (~33 ms on T4), 100+ languages via
the multilingual checkpoint, trained with RLCD (RL against strictly proper scoring
rules) so honest probabilities maximize reward. Runs locally via `pip install laya`;
this repo ships a reference sidecar (`sidecars/laya/server.py`). Strengths: speed,
price ($0), multilingual, calibration (ECE 0.081 after temperature fit). Weaknesses:
base checkpoints are near chance zero-shot on typed decisions (need fine-tuning),
degrades on very high-cardinality choices (token budget per option), ordinal scores
are its weakest primitive.

Both expose the same question schema, so **one question registry drives both**.

## Architecture

```
USER → REQUIREMENT → AI AGENT → PROPOSED ACTION
                                     │
                              DECISION FIREWALL   ← guard(): no approval → no execution
                                     │
                              CONTEXT BUILDER     ← context/v1, deterministic state text
                                     │
                        ┌──────────┴──────────┐
                        │  DECISION MODEL     │   JevAdapter │ LayaAdapter │ MockAdapter
                        └──────────┬──────────┘
                            TYPED ANSWERS (shared schema)
                                     │
                              POLICY ENGINE v1    ← deterministic ALLOW/ASK/BLOCK
                                     │
                          ALLOW → EXECUTOR   ASK → human   BLOCK → stop
```

Fails closed: adapter unavailable, timeout, invalid JSON, missing answer,
schema mismatch, or exception ⇒ **BLOCK**, never "execute anyway".

## Layout

| Path | Purpose |
| --- | --- |
| `src/state/` | Canonical `DecisionState` (§7) — one state for every adapter/harness/replay |
| `src/questions/` | Versioned question registry (§5) + zero-dep YAML subset parser |
| `src/context/` | `context/v1` builder: state → deterministic model-agnostic text (§8) |
| `src/adapters/` | Contract, Jev, Laya, Mock adapters; error-as-data, never throw (§4, §26) |
| `src/config/` | Layered config: file < `FIREWALL_MODEL` < `--model` (§3) |
| `src/policy/` | Deterministic policy v1 → ALLOW/ASK/BLOCK (fail-closed) |
| `src/firewall/` | `DecisionFirewall.guard()` — the only path to the executor (§1) |
| `src/audit/` | Versioned JSONL audit log with explicit secret redaction (§27) |
| `src/datasets/` | Typed loader for golden / adversarial / regression datasets (§9, §10, §16) |
| `src/eval/` | Per-dimension metrics, Brier/ECE, escape + friction rates (§11, §12) |
| `src/promotion/` | Configurable promotion gates (§18) |
| `config/questions.v1.yaml` | Registry v1: 8 questions, noul/score types |
| `config/datasets/*.v1.yaml` | Golden (13), adversarial (7), regression (3) cases |
| `sidecars/laya/server.py` | Reference Laya sidecar (Apache-2.0 `laya` package) |
| `.github/workflows/ci.yml` | CI pipeline per §24 |

## Datasets

- **Golden v1** — safe actions, scope creep, destructive, sensitive, privilege
  escalation, deployment, network. Every case carries per-question ground truth
  plus the expected end-to-end verdict.
- **Adversarial v1** — prompt injection, fake authorization, urgency manipulation,
  encoded commands, path traversal, tool substitution, env exfiltration. The
  expected decision follows the *actual operation*, never the agent's explanation.
- **Regression v1** — permanent cases for every bug class (secret allowed, scope
  creep allowed, production deploy allowed).

## Metrics (never one aggregate number)

Per question dimension: accuracy, precision, recall, F1, FPR, FNR, Brier, ECE.
Firewall level: verdict accuracy, **dangerous-action escape rate** (primary
security metric), **safe-action friction** (ASK rate on safe actions), escapes
by category, adapter/schema failure count. Security-critical classes
(secret exposure, production deploy, destructive FS, credential access) stay
separate — never hidden in an aggregate.

## Usage

```bash
npm ci

# evaluate a dataset with a model (code-free switching)
FIREWALL_MODEL=mock npx tsx src/cli/index.ts eval --dataset golden.v1
npx tsx src/cli/index.ts eval --model mock --mock-mode block_all --dataset adversarial.v1

# A/B comparison across models
npx tsx src/cli/index.ts compare --models mock,mock --dataset golden.v1

# one-command validation
npx tsx src/cli/index.ts test

# with real models
TYPESAFE_API_KEY=... npx tsx src/cli/index.ts eval --model jev
pip install laya && python sidecars/laya/server.py &
npx tsx src/cli/index.ts eval --model laya
```

Exit codes double as CI gates: `eval` exits 1 if any dangerous action escaped.

## Milestones

- [x] M1 — firewall core: Jev + Mock adapters, question registry, datasets,
      evaluation runner, audit log, CLI, deterministic policy, fail-closed execution
- [x] M2 — Laya adapter (identical schema; zero firewall code changed)
- [x] Partial M3 — escape/friction gates; A/B compare
- [ ] M3 remainder — shadow mode, replay, human feedback loop, disagreement explorer
- [ ] M4 — MCP interception, shell/git/network/database/browser executors
- [ ] M5 — continuous evaluation, candidate datasets, automated promotion

## Non-goals

No autonomous agent, chatbot, code generation, model training, or policy
auto-modification. The product is the decision boundary and the evaluation system.
