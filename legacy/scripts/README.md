# `legacy/scripts/` — quarantined old-deploy stack

These scripts predate the clean build. They wire the dead `GNS_*` / `gns.env` / `ONT_LAUNCH_HEIGHT` snapshot
model and are **not** the clean deploy path. They are quarantined (moved out of `scripts/`, npm entries dropped),
**not deleted** — kept for reference only.

The canonical clean-stack deploy path is the docker compose + [`G3_CLEAN_SLATE_VPS.md`](../../docs/operate/G3_CLEAN_SLATE_VPS.md)
runbook. The classification and rationale for this quarantine are in
[`OLD_DEPLOY_QUARANTINE_SCOPE.md`](../../docs/operate/OLD_DEPLOY_QUARANTINE_SCOPE.md).

| Script | Was | Why quarantined |
|---|---|---|
| `deploy-vps.sh` | `deploy:vps` | writes `/etc/gns/gns.env`, `ONT_LAUNCH_HEIGHT`, snapshot |
| `deploy-private-signet-vps.sh` | `deploy:private-signet:vps` | old private-signet GNS deploy |
| `bootstrap-vps.sh` | `bootstrap:vps` | GNS-stack VPS bootstrap |
| `bootstrap-private-signet-vps.sh` | `bootstrap:private-signet:vps` | GNS-stack signet bootstrap |
| `bootstrap-ont-domain.sh` | `bootstrap:ont-domain:vps` | old domain/web bootstrap |
| `install-private-signet-electrum.sh` | _(invoked by the deploy scripts)_ | root/systemd/electrs installer; deploy-support |

> Internal cross-references inside these scripts still use the original `scripts/` paths. They are dead and
> not meant to run — we do not rewrite their internals. Do not wire any of these back to a live `package.json`
> entry; `npm run check:deploy` fails any live entry that points into `legacy/scripts/`.
