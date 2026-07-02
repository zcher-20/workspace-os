#!/usr/bin/env bash
# Sparse-checkout the four Anthropic document skills into src/workspace/skills/.
#
# Clones github.com/anthropics/skills with a blobless, sparse checkout limited to
# skills/{docx,pdf,pptx,xlsx}, then copies those four folders VERBATIM into
# <repo>/src/workspace/skills/. Existing copies are replaced.
#
# Usage:
#   ./scripts/fetch_skills.sh
set -euo pipefail

REPO="${1:-https://github.com/anthropics/skills}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="$ROOT/src/workspace/skills"
SKILLS=(docx pdf pptx xlsx)

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "Cloning $REPO (sparse) into $TMP ..."
git clone --depth 1 --filter=blob:none --sparse "$REPO" "$TMP/skills"
( cd "$TMP/skills" && git sparse-checkout set "${SKILLS[@]/#/skills/}" )

mkdir -p "$DEST"
for s in "${SKILLS[@]}"; do
  rm -rf "${DEST:?}/$s"
  cp -r "$TMP/skills/skills/$s" "$DEST/$s"
  echo "Copied $s -> $DEST/$s"
done

echo "Done. Skills are in $DEST"
