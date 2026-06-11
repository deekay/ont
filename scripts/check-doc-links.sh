#!/usr/bin/env bash
# Repo-wide relative markdown link checker for docs/.
# Prints "file:line: target" for every relative link that does not resolve.
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
exit $broken
