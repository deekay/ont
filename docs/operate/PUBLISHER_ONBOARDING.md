# Publisher Onboarding

This guide describes the target shape for running a publisher without making
any payment or wallet backend a project dependency.

Status: product/operator guidance. The protocol API is
[`../spec/ONT_PUBLISHER_PROTOCOL_SPEC.md`](../spec/ONT_PUBLISHER_PROTOCOL_SPEC.md);
the current implementation status is
[`../core/STATUS.md`](../core/STATUS.md).

## Principle

ONT ships the publisher stack, configuration, adapter interfaces, and health
checks. Operators choose interchangeable payment, signing, and broadcast
backends.

That keeps setup simple without turning any commercial service into protocol
infrastructure.

## What A Publisher Needs

A live publisher needs these capabilities:

- payment intake: quote, invoice or payment request, payment detection, refund
  or failure status
- Bitcoin transaction funding/signing/broadcast: create the batch anchor
  transaction, fund it, sign it, broadcast it, and track confirmation
- durable storage: quotes, paid claims, batches, anchor txids, and batch data
- data availability: serve the batch data needed by verifiers after an anchor
  confirms
- health checks: refuse live mode unless payment, signing, broadcast, storage,
  and expected network checks pass

These are capability requirements, not product requirements. A backend can be
hosted, self-hosted, a node wallet, a PSBT signer, or a custom adapter, as long
as it satisfies the same checks.

## Setup Profiles

The setup flow should be progressive:

1. **Dev / signet profile**: fixture or signet defaults, stubbed or test-only
   payment, safe local storage, and no mainnet funds.
2. **Simple hosted-backend profile**: minimal operator choices, hosted payment
   or signing backend, explicit provider configuration, and health checks before
   accepting claims.
3. **Self-hosted profile**: operator-run payment backend, Bitcoin backend,
   durable storage, monitoring, and backup steps.
4. **Custom profile**: explicit adapter URLs/commands for operators who already
   have their own wallet, signer, broadcast, or accounting stack.

The simple path should have good defaults, but the screen and docs should make
clear that the backend is replaceable.

## Provider Recipe Policy

Project docs should distinguish the canonical path from examples:

- canonical docs describe required capabilities, adapter contracts, config keys,
  and health checks
- optional recipes may show specific hosted or self-hosted backends
- a recipe is an example, not an endorsement or protocol dependency
- commercial links, if present, belong in recipe docs, not in the core protocol
  spec
- every recipe should state the same operator responsibilities: custody,
  liquidity, fees, uptime, backups, refunds, and support

Do not frame setup as "use provider X." Frame it as "choose a compatible
backend" with recipes for common choices.

## Target CLI Flow

The first productized path should be a CLI wizard:

```bash
ont publisher init
```

The wizard should:

1. choose network, with dev/signet first and mainnet explicit
2. choose profile: hosted backend, self-hosted backend, or custom
3. collect payment-backend config
4. collect signing/broadcast-backend config
5. configure storage and operator metadata
6. run health checks
7. write config only after checks pass or clearly mark what remains incomplete

Live mode should fail closed if the configured backends are unreachable, on the
wrong network, or unable to prove the required capabilities.

## Future One-Click Path

A later web launcher can wrap the same flow, but it should deploy/configure an
ONT publisher rather than redirecting operators to a single vendor.

The one-click path should:

1. choose network and setup profile
2. generate config
3. connect chosen backends
4. run the same health checks as the CLI
5. publish operator metadata only after the stack is ready
6. start accepting claims only after payment, signing, broadcast, storage, and
   data-availability checks pass

The "one click" promise is about fewer decisions and safer defaults, not about
hiding custody or backend responsibility.

## Near-Term Work

Before mainnet publisher onboarding is ready, the project needs:

- adapter contracts for payment intake and payment verification
- adapter contracts for funding/signing/broadcast
- a signet/dev setup path that can be completed in minutes
- provider-neutral health checks
- optional backend recipes
- clear operator metadata so wallets can compare publishers without treating
  one backend as canonical
