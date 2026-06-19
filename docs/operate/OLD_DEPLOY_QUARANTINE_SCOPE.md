# Old-deploy quarantine — scope (G3 cleanup slice)

**Status:** cut settled — ChatLunatique reviewed `3f0ccf99` and his three findings are folded here (F1 move
`install-private-signet-electrum.sh` A; F2 CI-coupling caveat on B; F3 soften the self-host note). Bucket A is
executed on this branch in the following commit; Bucket B remains a DK ruling.
**Branch:** `go-live-g3-cleanup` (off `main` @ `bd40e702`).
**Lane:** ClaudeleLunatique (hygiene). Reviewer: ChatLunatique. Merge: DK.
**Trigger:** [`G3_CLEAN_SLATE_VPS.md` Notes](./G3_CLEAN_SLATE_VPS.md) names the old VPS deploy scripts as a separate
cleanup slice. They predate the clean build, wire the dead `GNS_*` / `gns.env` / `ONT_LAUNCH_HEIGHT` snapshot
model, and are now inconsistent with the canonical compose + runbook clean-stack path.

## Principle

**Mirror the `legacy/` pattern: move + de-list, never delete.** Quarantine the unambiguously-dead VPS *deploy*
stack now. Do **not** unilaterally move DK's private-signet *local-dev* helpers — those are his tooling; flag
them for a keep/retire ruling instead. The clean stack (compose / `.env.example` / `entrypoint.sh`) references
none of these scripts, and the 1314-green `npm test` sweep (`test` → `build && test:workspaces`) invokes none of
them — **Bucket A is load-bearing for nothing.**

> **Caveat (CL finding 2):** Bucket B is *not* fully test-free. CI runs `test:private-signet-auto-mine-script`
> (`.github/workflows/ci.yml:35` → `scripts/private-signet-auto-mine.test.mjs` + `scripts/private-signet-auto-mine.sh`).
> So Bucket B stays gated on DK and, **if it ever moves, CI + the `package.json` entries must change in the same
> commit** — the dangling-entry checker below will fail any B-move that drops the script but leaves the entry.

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
| `scripts/install-private-signet-electrum.sh` | _(none — invoked by the deploy scripts)_ | root/systemd/electrs installer (`/etc/systemd/system/electrs-private-signet.service`, `apt-get install`, `/opt/electrs`); referenced **only** by `deploy-private-signet-vps.sh:194,226` + `bootstrap-private-signet-vps.sh:522` → deploy-support, not local-dev tooling (CL finding 1) |

> Internal cross-refs (e.g. `deploy-private-signet-vps.sh:194` `install -m 755 .../scripts/install-private-signet-electrum.sh`)
> reflect the original `scripts/` layout and are left as-is — these are dead, quarantined-not-resurrected scripts; we
> do not rewrite their internals.

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
  `launch-sparrow-signet.sh`
  — entries `sparrow:private-signet:{config,configure,start,tunnel}`
  (`install-private-signet-electrum.sh` moved to Bucket A per CL finding 1 — it's deploy-support, not Sparrow tooling)
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
`scripts/g3-seed-anchor.mjs` (G3 seeded read-presence).

`scripts/selfhost-doctor.sh` + `scripts/selfhost-init.sh` stay (`selfhost:up` now points at the clean compose,
`selfhost:init` just copies `.env.example`). **Soften (CL finding 3):** `docs/operate/SELF_HOSTING.md:103-148`
and `selfhost-doctor.sh:84-101` still describe the fixture / `ONT_SOURCE_MODE` / old-port shape — *not*
clean-stack-current. Not a Bucket A blocker; flagged as a **separate small follow-up cleanup**, out of this slice.

## Checker tightening (keep the quarantine from rotting back)

Extend `check:deploy` (`scripts/check-deploy-clean-stack.mjs`) with a RED→GREEN assertion over **root
`package.json` script values** (CL-approved shape): every `./scripts/<name>` a live entry invokes must exist,
and **no live entry may reference `legacy/scripts/…`**. So dropping a script without dropping its entry — or
wiring a quarantined script back to a live entry — is a gate failure, the same way the existing checker pins the
clean-stack wiring.

## Out of scope

- The publisher slice (ChatLunatique's lane) — real claim → anchor → ingest → render.
- Heavy compose changes — held until DK's VPS clean-slate boot feedback lands (it could reshape the infra).
- Bucket B moves — gated on DK's keep/retire ruling.

## Execution order (Bucket A — executed on this branch)

1. `git mv` the **6** Bucket A scripts → `legacy/scripts/` (5 deploy/bootstrap + `install-private-signet-electrum.sh`).
2. Drop the **5** Bucket A `package.json` entries (`install-private-signet-electrum.sh` has no entry).
3. Add `legacy/scripts/README.md` — a pointer back to this scope doc + `G3_CLEAN_SLATE_VPS.md` so the moved names stay findable (CL move-target answer).
4. Superseded banners on `VPS_SETUP.md` + `ONT_DOMAIN_DEPLOY.md`; update the `G3_CLEAN_SLATE_VPS.md` Notes
   line to point at `legacy/scripts/` instead of "next slice."
5. Add the `check:deploy` package.json script-target assertion; confirm it goes RED on a planted bad entry, then GREEN.
6. Gates: `check:deploy`, `check:surfaces`, doc-links, full `npm test` sweep — all green.

**Bucket B** stays out of this slice — gated on DK's keep/retire ruling (CI-coupling caveat above).
