# Private-signet stand-up re-point (4b) — spec

**Status:** spec, dispatched to ChatLunatique (builder). Queued behind slice 8
(`GA-OPTION-NODE`, #99) — non-blocking to that work.

**Governing decision:** `prototype-demo-network` (#36) — the only supported
live demo/test chain is **private signet**; public signet is retired. Reaffirmed
by DK 2026-07-03 (events e09473d2 → 4d3fcf06/d3566d54) after catching that the
G-track live stand-up had drifted onto public signet.

**Why:** the clean-build `docker-compose.yml` bitcoind runs bare `-signet`
(line 24) = the **public** default chain, so first boot does a public IBD
(checkpoint h311445) and funding needs a faucet drop — a human step. DK's ruling:
this is a *test-and-validate* environment, not a real-money-names one, so we take
on neither cost. Private signet with a challenge **we** control mines instantly
and self-funds from coinbase → no IBD, no faucet, no human in the funding loop.

## 0. Reference implementation already exists

`legacy/scripts/bootstrap-private-signet-vps.sh` (+ `install-private-signet-electrum.sh`,
`scripts/grind-header-fast.c`) is a **complete, proven** private-signet stand-up
from the pre-clean-build era. It already does exactly what we need:

- `signetchallenge=51` (OP_TRUE — an anyone-can-solve challenge; **no signing key
  to manage**)
- clones Bitcoin Core source for `contrib/signet/miner`, compiles a fast header
  grinder (`ont-grind-header-fast`) as the miner's `--grind-cmd`
- `BOOTSTRAP_BLOCKS=110` — mines 110 blocks so coinbase **matures** (100-block
  coinbase maturity) into spendable demo funds

This slice is **"adapt that approach onto the clean-build `docker-compose.yml`
stack,"** not build-from-scratch. Lift the challenge + miner mechanics; drop the
legacy service topology (old `/opt/ont/app` layout, electrum shim, per-service
ports) — the clean-build stack (indexer/resolver/publisher/web) already replaces it.

## 1. Deltas

1. **bitcoind (compose):** add `-signetchallenge=${ONT_SIGNET_CHALLENGE:-51}` to
   the `bitcoind` command. Everything else (`-signet -server -txindex`, RPC auth,
   healthcheck) stays. Document `ONT_SIGNET_CHALLENGE` in `.env.example`.
   `npm run check:deploy` must stay green.
2. **Miner:** a bootstrap + steady-state block producer for the private chain.
   Simplest shape: a small sidecar/one-shot that runs `contrib/signet/miner`
   (grind-cmd against a compiled fast grinder) — mine `BOOTSTRAP_BLOCKS` (default
   110) at boot, then a low-rate ongoing cadence (e.g. one block / 30–60 s) so new
   claims confirm. Coinbase → the operator funding address (see §2). With OP_TRUE
   no wallet key is needed to solve blocks.
3. **Funding = self-mine, not faucet.** `G_C_MINIMAL_SPEC.md §6.3`'s "Fund" step
   changes source: instead of a public-signet faucet drop, mine coinbase to the
   **off-box funding wallet's** address (the publisher never signs; the off-box
   wallet does — compose header). Operator generates the funding address off-box,
   passes it to the miner as the coinbase target, waits for maturity. Update §6.3
   to describe this; delete the handed-off `mrhgg…` faucet address from the walk.

## 2. Invariants (do not cross)

- `consensus/src` **zero-diff**, `@ont/bitcoin` **zero-diff** — this is deploy/
  compose + miner tooling only, never a consensus or verification-path change.
- `ONT_CHAIN=signet` on indexer/resolver/publisher stays unchanged — the app
  still speaks "signet"; only the *challenge* (and therefore the chain identity)
  is ours.
- The A′ fixture-enforcement path (§6.2, #97) is untouched: material file placed
  before the indexer boots with enforcement on. Private signet does not change
  the enforcement seam.
- **Trust posture is unchanged and must not be over-claimed.** On a chain whose
  challenge key we hold, the header chain is **provider-trusted** (#95) — the same
  label as today. `GA-SIGNET-SOLUTION` (#100, validating the BIP325 challenge to
  reach *cryptographically-caught*) is **foreclosed here** (circular — we hold the
  key) and stays design-of-record only (`GA_SIGNET_SOLUTION_SPEC.md`). No verify
  surface may render a private-signet header chain as independently verified.

## 3. Acceptance

1. `docker compose up` boots a **private** signet (custom challenge) — no public
   IBD; blocks appear from the miner within seconds.
2. 110 bootstrap blocks mined; the off-box funding wallet shows a **spendable
   (mature)** balance from coinbase — no faucet touched.
3. The full `G_C_MINIMAL_SPEC.md §6` walk runs to `§7 4b` acceptance: one real
   anchored claim (via the A′-seeded fixture path) verifies end-to-end from **all
   three** surfaces (CLI / web / mobile) against the live resolver.
4. `npm run check:deploy`, root gate, and standing gates green;
   `consensus/src` + `@ont/bitcoin` diffs empty.

## 4. Out of scope

Public-signet IBD, faucet integration, the BIP325 challenge verifier (#100), and
the legacy VPS service topology. Mainnet is not in view.
