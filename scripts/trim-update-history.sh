#!/usr/bin/env bash
# Every shipped version adds a fresh commit under updates/ (a Mac zip+dmg and
# a Windows exe, ~150-250MB combined) and the old ones are never removed from
# git history — only the *current* files matter (the update feed only ever
# points at the latest), so history grows forever for no benefit. This
# rewrites history to drop every past version of updates/ and re-adds just
# the current one, shrinking .git back down without changing what's actually
# served.
#
# Run this occasionally (whenever .git has grown uncomfortably large again —
# `du -sh .git` to check), not after every release.
#
# Requires git-filter-repo (`brew install git-filter-repo`).
#
# IMPORTANT: this rewrites every commit hash and needs a force-push, which
# Claude Code's safety classifier will not run unattended even with
# confirmation — run this script (and the git push it prints at the end)
# from a plain Terminal window yourself, not through the assistant.

set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Working tree isn't clean — commit or stash first." >&2
  exit 1
fi

if ! command -v git-filter-repo >/dev/null; then
  echo "git-filter-repo not found — install it first: brew install git-filter-repo" >&2
  exit 1
fi

remote_url="$(git remote get-url origin)"
backup_dir="$(mktemp -d)/updates-backup"
echo "Backing up current updates/ to $backup_dir"
mkdir -p "$backup_dir"
cp -R updates/. "$backup_dir"/

echo "Rewriting history (this also removes the 'origin' remote — expected)..."
git filter-repo --path updates --invert-paths --force

git remote add origin "$remote_url"

echo "Restoring current update feed..."
mkdir -p updates
cp -R "$backup_dir"/. updates/
git add updates/
git commit -m "Re-add current update feed after trimming binary history"

echo
echo "Done. Review with 'git log' / 'du -sh .git', then push yourself with:"
echo "  git push --force -u origin main"
