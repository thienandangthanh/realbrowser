# Research: Porting `realbrowser` from Codex to Claude Code

Date: 2026-05-12 19:15 KST
Scope: Realbrowser repo at `/home/andang/dev/realbrowser` (v0.2.1).
Question: Can it run as a Claude Code skill? What must change? Can Claude
Code agents iterate on it autonomously?

---

## TL;DR

Yes. Realbrowser is already 90% Claude-Code compatible. The CLI is
environment-agnostic CDP/Node, and the SKILL.md frontmatter already matches
Claude Code's spec. The Codex coupling is shallow: install-path strings in
docs, an OpenAI-shaped `agents/openai.yaml`, and "Codex" naming in prose. No
runtime change required for the core to work; the CLI already includes
`CLAUDE_SESSION_ID` in its owner-detection env keys
([scripts/realbrowser.mjs:57](../../scripts/realbrowser.mjs)).

Autonomous iteration is feasible: `self-test` + smoke scripts give a mechanical
pass/fail signal that `ck:autoresearch` / `ck:loop` can optimize against.

---

## 1. Compatibility Audit

### 1.1 Runtime: zero Codex dependency
- Pure Node 22 + raw CDP WebSocket, no SDK ties.
- State dir is configurable (`REALBROWSER_STATE_DIR`).
- Owner key list already includes Claude
  ([scripts/realbrowser.mjs:51-59](../../scripts/realbrowser.mjs)):
  ```js
  const OWNER_ENV_KEYS = [
    "REALBROWSER_OWNER",
    "CODEX_THREAD_ID", "CODEX_SESSION_ID", "CODEX_SESSION",
    "OPENAI_SESSION_ID",
    "CLAUDE_SESSION_ID",     // already there
    "TERM_SESSION_ID", "ITERM_SESSION_ID",
  ];
  ```
- Self-test runs offline: `./scripts/realbrowser self-test`.

### 1.2 Skill manifest: already in Claude Code shape
`SKILL.md` frontmatter (`name` + `description`) matches Claude Code's
spec verbatim ([code.claude.com/docs/en/skills](https://code.claude.com/docs/en/skills),
[agentskills.io/specification](https://agentskills.io/specification)). No
schema change needed.

### 1.3 What is Codex-specific (cosmetic only)
| File | Issue | Severity |
|------|-------|----------|
| `README.md:48`, `SKILL.md:25,31` | Install path `$HOME/.codex/skills/...` | Doc-only |
| `agents/openai.yaml` | Codex-only manifest (`display_name`, `default_prompt`, `policy`) | Unused by Claude Code |
| `SKILL.md`, `README.md`, `references/*.md` | Prose says "Codex session", "parallel Codex sessions" | Doc-only |
| `scripts/realbrowser.mjs:1458,6195` | Help text says "Codex sessions / Codex/project owner" | Doc-only |
| `CHANGELOG.md` | Past-tense Codex references | Historical, leave |

Nothing in the runtime breaks under Claude Code. Even
`agents/openai.yaml` is just unused dead weight.

---

## 2. Minimal Changes to Run Under Claude Code

### 2.1 Install (one of)
- **User-scope (recommended)**: symlink/copy the repo into
  `~/.claude/skills/realbrowser/` so `SKILL.md` is at
  `~/.claude/skills/realbrowser/SKILL.md`. Claude Code auto-discovers it
  ([claude.com docs](https://code.claude.com/docs/en/skills)).
- **Project-scope**: copy `SKILL.md` + `scripts/` + `references/` into
  `<project>/.claude/skills/realbrowser/`.
- **Or zero-install**: skip skill discovery, just call `node
  scripts/realbrowser.mjs ...` directly from prompts.

### 2.2 Doc edits (kebab to keep parity with Codex copy)
1. `SKILL.md` lines 23-32: add a Claude path block next to the Codex one:
   ```bash
   REALBROWSER="$HOME/.claude/skills/realbrowser/scripts/realbrowser"
   ```
2. `README.md` lines 46-58: same — present both paths or a vendor-neutral
   `"$REPO/scripts/realbrowser"`.
3. Globally re-word "Codex sessions" → "agent sessions" (Codex *and*
   Claude Code remain valid examples).
4. Help strings in `scripts/realbrowser.mjs:1458,6195` → drop "Codex" word.

### 2.3 Manifest parity (optional, nice-to-have)
Add `agents/claude.md` or `agents/claude.yaml` as a Claude Code-flavored
mirror of `openai.yaml`. Not required — Claude Code reads only `SKILL.md`.
A neutral `agents/README.md` explaining "this dir holds vendor manifests"
is cleaner than vendor-specific files.

### 2.4 No code change strictly required
The CLI already resolves owner from `CLAUDE_SESSION_ID`. If Claude Code
exposes a different env var name in the future, just append it to
`OWNER_ENV_KEYS`.

**Total effort**: ~30 lines of doc edits + an optional install script.
A single PR.

---

## 3. Autonomous Iteration with Claude Code Agents

Yes — the repo has the right ingredients for an autonomous improvement
loop:

### 3.1 Mechanical signals available
- `node --check scripts/realbrowser.mjs` (syntax)
- `./scripts/realbrowser --version`
- `./scripts/realbrowser self-test` (in-process parser/help/state checks)
- `./scripts/realbrowser help` for every group
- Anonymous `about:blank` smoke (CHANGELOG.md:107)

These are deterministic; perfect fuel for `ck:autoresearch` / `ck:loop`.

### 3.2 Recommended loop shapes
| Pattern | Skill | Use for |
|---------|-------|---------|
| Metric-driven iteration | `ck:autoresearch` / `ck:loop` | "Reduce self-test failures to 0", "shrink CLI start latency to <X ms" |
| Multi-agent parallel | `team` | researcher + implementer + tester + reviewer working concurrently |
| Linear chain | `planner` → `fullstack-developer` → `tester` → `code-reviewer` | One feature per PR (per `~/.claude/rules/primary-workflow.md`) |
| Edge-case probing | `ck:scenario` then `ck:predict` | Catch design holes before implementation |

### 3.3 Concrete autonomous-loop recipe
Goal: harden realbrowser against Claude Code workloads with no human in
the loop.

1. **Seed metric** — extend `self-test` with Claude-Code-specific cases:
   - `CLAUDE_SESSION_ID` owner resolution
   - install-path docs lint (no `.codex` strings in Claude-mode build)
   - skill discovery: `SKILL.md` resolves from `~/.claude/skills/...`
2. **Loop driver** — `ck:autoresearch` running until `self-test` passes
   100% and no Codex-only strings remain.
3. **Guardrails** — git history learn-mode auto-discards regressions;
   `code-reviewer` agent gates merge.
4. **Reporting** — each iteration writes to `plans/reports/` per project
   docs convention.

### 3.4 Limits / what won't work autonomously
- **Real Chrome attach** requires Chrome's approval prompt — Chrome owns
  that boundary (SKILL.md:172-177); no agent can suppress it on a fresh
  browser. Anonymous-session tests bypass this; signed-in tests need a
  human at first launch.
- **Visual semantics** (annotated screenshots, active-root inference)
  resist metric loops; pair with `ck:predict` or human spot-checks.
- **Lease/parallelism bugs** are race-condition-shaped — needs
  multi-process stress harness, not single-shot self-test.

---

## 4. Recommended Next Steps

1. Land doc-only PR: dual-path install instructions, remove "Codex" prose,
   add `~/.claude/skills/realbrowser` install snippet.
2. Add `scripts/install-claude.sh` (symlink repo into
   `~/.claude/skills/realbrowser`).
3. Extend `self-test` with two new checks:
   - `CLAUDE_SESSION_ID` flows to owner resolution.
   - Help text contains no vendor-specific strings (or contains both).
4. Wire a `ck:autoresearch` run with `self-test` + a Claude-Code smoke
   harness as the metric; let it iterate.
5. Stretch: add `agents/claude.md` mirroring `openai.yaml` for symmetry.

---

## 5. Sources

- [Claude Code Skills docs](https://code.claude.com/docs/en/skills)
- [Anthropic skills repo](https://github.com/anthropics/skills)
- [SKILL.md spec — agentskills.io](https://agentskills.io/specification)
- [SKILL.md format reference — Agensi](https://www.agensi.io/learn/skill-md-format-reference)
- Repo evidence:
  [scripts/realbrowser.mjs:51-59](../../scripts/realbrowser.mjs),
  [SKILL.md](../../SKILL.md),
  [README.md](../../README.md),
  [agents/openai.yaml](../../agents/openai.yaml),
  [CHANGELOG.md](../../CHANGELOG.md)

---

## Unresolved Questions

1. Should the repo support **both** Codex and Claude Code as first-class,
   or pivot Claude Code to first-class and demote Codex? (Affects naming
   in agent manifests and prose.)
2. Does Claude Code expose a stable session-id env var today? If yes,
   confirm name and pin it in `OWNER_ENV_KEYS`. If not, document the
   `REALBROWSER_OWNER` fallback for Claude Code users.
3. Is there appetite for a thin Claude Code plugin (slash command,
   pre-tool hook) on top of the skill, or keep it CLI-only?
4. For the autonomous loop: target metric — pass-rate, latency, token
   cost of typical reads, or all three?
