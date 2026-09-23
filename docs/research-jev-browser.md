# Jev Browser: research findings (Cline + ecosystem), Sept 2026

## What Cline does with a browser today

Cline's built-in browser tool (before Jev): `launch / navigate / click / type /
scroll / screenshot / close`, with human-in-the-loop approval before actions.
The LLM reasons over rendered screenshots — slow, expensive, non-deterministic,
and hard to evaluate.

## The `jev-browser` plugin (official cline/plugins repo, ~Sept 15 2026)

- Gives a Cline agent an **isolated Playwright Chromium** through normal Cline tools.
- Cline delegates **bounded browser goals** to Jev through Vercel AI Gateway.
- Automatic **before/after screenshots**, optional manual actions.
- `jev_run` uses AI SDK evaluate with `typesafe-ai/jev`: **one evaluation chooses
  a concrete operation AND target together**, comparing each available action
  against scrolling / waiting / stopping.
- Jev sees **structured DOM observations with indexed visible action targets**,
  selected form options (incl. offscreen), summaries of controls above the fold.
- Jev is the **decision engine** ("what should I do next?"); ordinary code owns
  the loop (budgets, recovery, stop gates). Never free-form generation.

## jkudish/jev-browser (standalone, MIT, TypeScript, MCP server / CLI / library)

- Drives a real headless browser; **Jev picks one action per step** from the
  page's clickable/typeable/selectable elements.
- Jev also **scores goal-met likelihood and stuck-ness** (completion judgment).
- Code owns the loop: budgets, recovery, stop gates.
- Output: final page, **step trace with per-step confidences**, console errors,
  screenshot.

## WebMCP benchmark findings (nekuda WindTunnel, Sept 2026)

- Jev alone choosing from raw page controls: 25/49 tasks.
- Jev + WebMCP (site exposes typed tools): **49/49**, 18% cheaper.
- **Key insight:** picking a valid button ≠ picking the right next step.
  Structured tool interfaces compress N clicks into one decision.
- **Split-brain pattern:** Jev picks the action; a small LLM generates argument
  text (search query, form text) — Jev cannot generate arbitrary text.
- Most cognitive load is in choosing the right action; argument generation is easy.

## Cross-cutting design lessons for our firewall integration

1. **Text-based DOM observation, not screenshots**, is the Jev/Laya-native view.
2. **One decision per step**, finite action space, plus completion/stuck scores.
3. **Isolation is a hard requirement** — Playwright context with strict settings.
4. Every step is a **state + questions** evaluation → fits our existing
   adapter/policy/dataset/eval stack exactly.
5. Open risks: DOM drift between observation and action, credential/login flows,
   prompt injection embedded in page content (adversarial dataset!), budgets.
