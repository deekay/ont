# Old-deploy quarantine — scope (G3 cleanup slice)

**Status:** proposal — review before execution. No files moved / no `package.json` edits in this commit.
**Branch:** `go-live-g3-cleanup` (off `main` @ `bd40e702`).
**Lane:** ClaudeleLunatique (hygiene). Reviewer: ChatLunatique. Merge: DK.
**Trigger:** [`G3_CLEAN_SLATE_VPS.md` Notes](./G3_CLEAN_SLATE_VPS.md) names the old VPS deploy scripts as a separate
cleanup slice. They predate the clean build, wire the dead `GNS_*` / `gns.env` / `ONT_LAUNCH_HEIGHT` snapshot
model, and are now inconsistent with the canonical compose + runbook clean-stack path.

## Principle

**Mirror the `legacy/` pattern: move + de-list, never delete.** Quarantine the unambiguously-dead VPS *deploy*
stack now. Do **not** unilaterally move DK's private-signet *local-dev* helpers — those are his tooling; flag
them for a keep/retire ruling instead. The clean stack (compose / `.env.example` / `entrypoint.sh`) references
none of these scripts, and the 1314-green sweep (`test` → `build && test:workspaces`) invokes none of them, so
nothing here is load-bearing for build, test, or the clean deploy path.

## Bucket A — Quarantine now (dead VPS deploy/bootstrap stack)

Unambiguously superseded by the G3 clean runbook. Each writes/reads the dead `GNS_*` / `gns.env` /
`ONT_LAUNCH_HEIGHT` / snapshot model (verified by grep; `deploy-vps.sh:173` writes `/etc/gns/gns.env`).

**Action:** move `scripts/<name>` → `legacy/scripts/<name>` (preserve git history via `git mv`), drop the
matching `package.json` entry, add superseded banners to the two stale operate docs.

| Script | package.json entry | Dead-model evidence |
|---|---|---|
| `scripts/deploy-vps.sh` | `deploy:vps` | writes `/etc/gns/gns.env`, `ONT_LAUNCH_HEIGHT`, snapshot |
| `scripts/deploy-private-signet-vps.sh` | `deploy:private-signet:vps` | private-signet GNS deploy |
| `scripts/bootstrap-vps.sh` | `bootstrap:vps` | GNS-stack VPS bootstrap |
| `scripts/bootstrap-private-signet-vps.sh` | `bootstrap:private-signet:vps` | GNS-stack signet bootstrap |
| `scripts/bootstrap-ont-domain.sh` | `bootstrap:ont-domain:vps` | old domain/web bootstrap |

**Docs (superseded banner → point at `G3_CLEAN_SLATE_VPS.md`):**
- `docs/operate/VPS_SETUP.md`
- `docs/operate/ONT_DOMAIN_DEPLOY.md`

## Bucket B — Flag for DK, do NOT auto-quarantine (private-signet local-dev helpers)

These are local dev/test tooling, not the dead remote-deploy stack. Some may still be useful to DK for
private-signet experiments. **DK ruling requested: keep in `scripts/` / quarantine to `legacy/scripts/` /
delete?** They are not in the clean deploy path and not in the main sweep, so leaving them in place costs
nothing but registry clutter.

- **Sparrow wallet helpers:** `configure-sparrow-private-signet.sh`, `print-private-signet-sparrow-config.sh`,
  `start-private-signet-sparrow-session.sh`, `open-private-signet-sparrow-tunnel.sh`,
  `launch-sparrow-signet.sh`, `install-private-signet-electrum.sh`
  — entries `sparrow:private-signet:{config,configure,start,tunnel}`
- **Mining / funding / seeding:** `private-signet-auto-mine.sh`, `private-signet-fund.sh`,
  `private-signet-mine.sh`, `reseed-private-signet-canonical.sh`, `reset-private-signet-demo.sh`
  — entries `reset:private-signet-demo`, `reseed:private-signet:canonical`
- **Auction smoke harnesses (standalone, not in `npm test`):** `private-signet-auction-smoke.mjs`,
  `private-signet-auction-phase-gallery.mjs`, `private-signet-auction-boundary.mjs`,
  `private-signet-value-recovery.mjs`, `private-signet-smoke-lib.mjs`, `private-signet-auto-mine.test.mjs`
  — entries `test:private-signet-auction-smoke`, `test:private-signet-auction-phase-gallery`,
  `test:private-signet-auto-mine-script`

> Dependency to resolve at execution time: `reset-private-signet-demo.sh` and the demo harnesses may be
> referenced by `docs/operate/demo/`. Grep before any move; don't break a live demo doc.

## Bucket C — Keep (clean-stack live, untouched)

`scripts/check-deploy-clean-stack.mjs` (the `check:deploy` gate — references `GNS_` only to *forbid* it),
`scripts/g3-seed-anchor.mjs` (G3 seeded read-presence), `scripts/selfhost-doctor.sh`.

## Checker tightening (keep the quarantine from rotting back)

Extend `check:deploy` (`scripts/check-deploy-clean-stack.mjs`) with one RED→GREEN assertion: **no live
`package.json` script entry may reference a quarantined path** (`legacy/scripts/…`) or a `scripts/<name>` that
no longer exists. This makes a re-introduced dead entry a gate failure, the same way the existing checker pins
the clean-stack wiring.

## Out of scope

- The publisher slice (ChatLunatique's lane) — real claim → anchor → ingest → render.
- Heavy compose changes — held until DK's VPS clean-slate boot feedback lands (it could reshape the infra).
- Bucket B moves — gated on DK's keep/retire ruling.

## Execution order (after review + DK ruling)

1. `git mv` Bucket A scripts → `legacy/scripts/`.
2. Drop the 5 Bucket A `package.json` entries.
3. Superseded banners on `VPS_SETUP.md` + `ONT_DOMAIN_DEPLOY.md`; update the `G3_CLEAN_SLATE_VPS.md` Notes
   line to point at the quarantine location instead of "next slice."
4. Add the `check:deploy` dangling-entry assertion; confirm it goes RED on a planted bad entry, then GREEN.
5. Gates: `check:deploy`, `check:surfaces`, doc-links, full sweep — all green.
6. Bucket B handled per DK's ruling in the same or a follow-up commit.
