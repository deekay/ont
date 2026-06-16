#!/usr/bin/env bash
# Repo-wide doc link checker.
# Pass 1: relative markdown links in docs/**.md.
# Pass 2: repo-root "docs/**.md|pdf" paths referenced from non-markdown
#         sources (TS/HTML code, comments, tests, github-blob DOC_URLS) —
#         catches code pointing at moved/retired docs, which pass 1 cannot see.
# Pass 3: bare repo-root "docs/**.md|pdf" paths in Markdown PROSE (backticks,
#         plain text — anything outside a relative link), in all tracked .md
#         files except docs/research/archive/ (historical paths there are
#         provenance, not navigation).
# Prints "file:line: target" for every reference that does not resolve.
# Exit 1 if any broken link is found, 0 otherwise.
set -u
cd "$(dirname "$0")/.." || exit 4
broken=0
while IFS= read -r f; do
  dir=$(dirname "$f")
  while IFS=: read -r line link; do
    target=${link%%#*}
    [ -z "$target" ] && continue
    if [ ! -e "$dir/$target" ]; then
      echo "$f:$line: $target"
      broken=1
    fi
  done < <(grep -noE '\]\((\.\.?/[^)]*)\)' "$f" | sed -E 's/\]\((.*)\)/\1/')
done < <(find docs -name '*.md')
while IFS= read -r f; do
  while IFS=: read -r line target; do
    [ -z "$target" ] && continue
    if [ ! -e "$target" ]; then
      echo "$f:$line: $target"
      broken=1
    fi
  done < <(grep -noE 'docs/[A-Za-z0-9_./-]+\.(md|pdf)' "$f" || true)
done < <(git ls-files 'apps/*.ts' 'apps/**/*.ts' 'apps/**/*.html' 'packages/**/*.ts' 'docs/**/*.html')
while IFS= read -r f; do
  while IFS=: read -r line target; do
    [ -z "$target" ] && continue
    if [ ! -e "$target" ]; then
      echo "$f:$line: $target"
      broken=1
    fi
  done < <(grep -noE 'docs/[A-Za-z0-9_./-]+\.(md|pdf)' "$f" || true)
done < <(git ls-files '*.md' ':!:docs/research/archive/**' ':!:legacy/**')
exit $broken
