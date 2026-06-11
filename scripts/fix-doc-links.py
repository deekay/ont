#!/usr/bin/env python3
"""Fix relative markdown links broken by file moves.

For every relative link in every .md file that doesn't resolve, look for a
unique file elsewhere in the repo with the same basename; if exactly one
exists, rewrite the link to the correct relative path. Ambiguous or unfound
targets are reported, not touched.
"""
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LINK_RE = re.compile(r"\]\((\.\.?/[^)#\s]+)(#[^)\s]*)?\)")

# index every file in the repo by basename (skip .git, node_modules)
by_base = {}
for dirpath, dirnames, filenames in os.walk(ROOT):
    dirnames[:] = [d for d in dirnames if d not in (".git", "node_modules", "dist", ".scratch")]
    for fn in filenames:
        by_base.setdefault(fn, []).append(os.path.join(dirpath, fn))

md_files = []
for dirpath, dirnames, filenames in os.walk(ROOT):
    dirnames[:] = [d for d in dirnames if d not in (".git", "node_modules", "dist", ".scratch")]
    md_files += [os.path.join(dirpath, f) for f in filenames if f.endswith(".md")]

fixed, unresolved = 0, []
for path in md_files:
    with open(path) as f:
        text = f.read()
    dirp = os.path.dirname(path)
    changed = False

    def repl(m):
        global fixed, changed
        target, anchor = m.group(1), m.group(2) or ""
        tpath = os.path.normpath(os.path.join(dirp, target))
        if os.path.exists(tpath):
            return m.group(0)
        base = os.path.basename(target.rstrip("/"))
        cands = by_base.get(base, [])
        if len(cands) == 1:
            rel = os.path.relpath(cands[0], dirp)
            if not rel.startswith("."):
                rel = "./" + rel
            fixed += 1
            changed = True
            return "](" + rel + anchor + ")"
        unresolved.append(f"{os.path.relpath(path, ROOT)}: {target} ({len(cands)} candidates)")
        return m.group(0)

    new = LINK_RE.sub(repl, text)
    if changed:
        with open(path, "w") as f:
            f.write(new)

print(f"fixed: {fixed}")
if unresolved:
    print("unresolved:")
    for u in unresolved:
        print("  " + u)
