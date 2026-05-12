#!/usr/bin/env bash
# Install realbrowser as a Claude Code skill by symlinking the repo into
# ~/.claude/skills/realbrowser (or a custom location via --prefix).
#
# Usage:
#   bash scripts/install-claude.sh [--force] [--copy] [--prefix=<dir>]
#
# Options:
#   --force          Remove an existing target before installing.
#   --copy           Copy the repo instead of creating a symlink.
#   --prefix=<dir>   Install into <dir>/realbrowser instead of ~/.claude/skills/realbrowser.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SKILLS_ROOT="${CLAUDE_SKILLS_DIR:-$HOME/.claude/skills}"
FORCE=0
USE_COPY=0

for arg in "$@"; do
  case "$arg" in
    --force)      FORCE=1 ;;
    --copy)       USE_COPY=1 ;;
    --prefix=*)   SKILLS_ROOT="${arg#--prefix=}" ;;
    *) echo "Unknown option: $arg" >&2; exit 1 ;;
  esac
done

TARGET="$SKILLS_ROOT/realbrowser"

mkdir -p "$SKILLS_ROOT"

if [ -e "$TARGET" ] || [ -L "$TARGET" ]; then
  if [ -L "$TARGET" ] && [ "$(readlink -f "$TARGET" 2>/dev/null)" = "$REPO_ROOT" ]; then
    echo "realbrowser: already installed at $TARGET -> $REPO_ROOT"
    exit 0
  fi
  if [ "$FORCE" -eq 0 ]; then
    echo "realbrowser: $TARGET already exists and is not the expected symlink." >&2
    echo "  Run with --force to remove it, or --copy to copy instead of symlinking." >&2
    exit 1
  fi
  rm -rf "$TARGET"
fi

if [ "$USE_COPY" -eq 1 ]; then
  cp -r "$REPO_ROOT" "$TARGET"
  echo "realbrowser: copied to $TARGET"
else
  ln -s "$REPO_ROOT" "$TARGET"
  echo "realbrowser: installed at $TARGET -> $REPO_ROOT"
fi

if [ -f "$TARGET/SKILL.md" ]; then
  echo "realbrowser: SKILL.md verified at $TARGET/SKILL.md"
else
  echo "realbrowser: WARNING — SKILL.md not found at $TARGET/SKILL.md" >&2
  exit 1
fi
