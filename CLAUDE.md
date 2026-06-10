# ONT — session grounding

Multiple agents work in this repo between your sessions (Claude App, a
Sprout-bridged Claude Code, Codex). **Your memory of this project is stale by
default.** Do not assert project state from a previous session's context.

## Refresh protocol — do this before relying on remembered state

1. `git log --oneline -15` — see what landed since you last looked.
2. Read `docs/core/STATUS.md` — the single source of truth for what is wired
   vs prototype. README, the brief, and the one-pager defer to it.
3. Skim the tail of `docs/core/DECISIONS.md` — numbered decisions supersede
   any analysis doc, research note, or channel discussion that predates them.

## Canonical doc order (read before asserting; notes are not facts)

1. `docs/ONT.md` — plain-language source of truth (one-path model)
2. `docs/ONT_DESIGN_BRIEF.md` — canonical design brief
3. `docs/design/ONT_ACQUISITION_STATE_MACHINE.md` — exact lifecycle
4. `docs/core/DECISIONS.md` + `docs/core/STATUS.md` — decisions and status
5. Code for code claims: `packages/{protocol,core,consensus}/src/*`

`docs/research/*` is analysis (kept current with decisions, but check dates);
`~/.sprout/RESEARCH/*` is drafting only — promoted notes carry SUPERSEDED
banners pointing at the repo copy.

## Standing rules

- When a numbered Decision lands, grep `docs/research/` and
  `~/.sprout/RESEARCH/` for conclusions it invalidates; update or banner them.
- Substantive doc/architecture changes get announced in the "ONT - dev"
  Sprout channel so other agents and DK hear about them (files can't push;
  the channel can).
- Never `git push` or commit without DK's approval. Filesystem scope and
  agent conventions: `~/.sprout/AGENTS.md`.
- ₿ notation where ₿1 = 1 satoshi; never write "sats" in user-facing copy.
  Only `opennametags.org`.
