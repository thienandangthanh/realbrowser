# Claude Code Support Port Complete

**Date**: 2026-05-12 
**Severity**: Medium
**Component**: Agent integration, skill distribution
**Status**: Resolved

## What Happened

Ported realbrowser v0.2.1 → v0.3.0 to add first-class Claude Code support alongside existing Codex integration. 8 atomic commits landed:

1. Self-test assertion for `CLAUDE_SESSION_ID` → `context.owner` flow
2. Dual install paths (`~/.codex/` + `~/.claude/`) in SKILL.md & README
3. Vendor-neutral prose across references (workflows, design-notes, commands)
4. Help text fixes (owner flag, lease conflict messages)
5. New `agents/claude.md` manifest mirror (Codex has YAML, Claude Code gets Markdown)
6. Install script `install-claude.sh` for idempotent symlink setup
7. Version bump to 0.3.0 with CHANGELOG entry
8. Live smoke test: anonymous Brave tab, screenshot capture

All 12 success metrics passed. Skill appeared in Claude Code skill list live after `install-claude.sh`.

## The Brutal Truth

Background subagent stalled on permissions mid-phase. In background mode, Bash calls require explicit approval that the asynchronous flow couldn't request. Recovered by taking over implementation in main session (which had all permissions pre-approved via `ExitPlanMode` negotiation). The sync/async permission boundary is a sharp edge for subagent delegation.

## Technical Details

- `CLAUDE_SESSION_ID` env var properly flows through `resolveContext()` to session owner
- Symlink verification: `ls ~/.claude/skills/realbrowser/` points to git root
- Browser detection logic (existing code) auto-handles `BROWSER=brave-browser` without changes
- Codex paths remain intact; no regression risk

## What We Tried

**Background fullstack-developer subagent** → stalled on permission prompt (Bash auto-approve not available in async context). **Direct implementation in main session** → succeeded (all permissions already negotiated).

## Root Cause Analysis

The orchestration protocol assumes subagents operate with equivalent permission scope. Background mode lacks interactive approval UX, creating a silent failure when a subagent hits file/command approval prompts. Sync main session has all approvals pre-negotiated via `ExitPlanMode`; background doesn't. This asymmetry broke the delegation model.

## Lessons Learned

1. **Permission Scope Matters for Delegation**: Subagents in background mode need explicit pre-approval of Bash/file operations, or they block silently.
2. **Plan Phase Negotiation Works**: `ExitPlanMode` approval flow ensures the main session carries all needed permissions into execution phase.
3. **Vendor Portability Requires Discipline**: Moving from Codex-only to multi-vendor requires touching prose everywhere (help text, docs, manifests). One missed string = confusion.
4. **Skill Discovery Is Predictable**: `~/.claude/skills/` auto-discovery works reliably and immediately; symlinks land skill in the list without server restart.

## Next Steps

- Monitor Codex → Claude Code switching (no user reports yet of broken Codex workflows)
- Document permission scope expectations in subagent delegation guide
- Consider async-friendly permission pre-approval mechanism for background tasks

---

**Files Changed**: `scripts/realbrowser.mjs`, `SKILL.md`, `README.md`, `references/*.md`, `agents/claude.md` (new), `scripts/install-claude.sh` (new), `CHANGELOG.md`

**Branch**: `dev/claude-code-support` | **8 commits** | **Codex preserved**
