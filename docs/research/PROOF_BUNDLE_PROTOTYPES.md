# ONT Proof Bundle Prototypes

This note defines four mock proof bundles for evaluating future ONT proof
sources.

Fixtures:

- [direct-l1-auction-proof.json](../../fixtures/proof-bundles/direct-l1-auction-proof.json)
- [ark-auction-transcript-proof.json](../../fixtures/proof-bundles/ark-auction-transcript-proof.json)
- [ark-sponsored-claim-proof.json](../../fixtures/proof-bundles/ark-sponsored-claim-proof.json)
- [rgb-state-transition-proof.json](../../fixtures/proof-bundles/rgb-state-transition-proof.json)

These are not production schemas. They are research fixtures to make the
verification question concrete.

## Is This Like Our Current JSON?

Yes, in spirit.

The current repo already uses JSON handoff artifacts such as auction bid
packages, transfer packages, fixtures, and simulation scenarios. A proof bundle
is the same general idea: a portable JSON artifact that another tool can parse.

The difference is purpose:

| Artifact | Purpose |
| --- | --- |
| Current auction bid package | Helps a bidder construct or review a bid. |
| Current transfer package | Helps parties construct or review a transfer. |
| Proof bundle | Helps a verifier prove why a name is owned. |

So a proof bundle is more verifier-facing than action-facing. It carries the
evidence needed by a fresh wallet, indexer, or resolver to reconstruct ownership
without trusting the server that handed over the file.

JSON is a good prototype format. A production version might become a compact
binary format, CBOR, protobuf, or signed JSON, but the structure should be easy
to reason about first.

## Do Auctions Work Roughly The Same?

The goal is yes: one ONT auction state machine, multiple transcript sources.

Stable auction concepts:

- valid name
- open height
- close rule
- soft-close rule
- minimum increment rule
- bid set
- winner rule
- settlement rule
- owner-key binding

What changes is the evidence source:

| Path | Transcript Source | Settlement |
| --- | --- | --- |
| Direct L1 auction | Bitcoin bid transactions | Winner bond is on L1. |
| Ark auction | Ark-backed batch transcript with VTXO collateral | Winner initially settles to L1 bond. |
| Ark sponsored claim | No auction unless challenged | Uncontested claim finalizes; challenged claim routes to auction. |
| RGB-style state | Client-side validated transition chain | Depends on schema; not yet a launch candidate. |

The design goal is not to create many auction systems. It is:

> same auction rules, different admissible proof sources.

## Prototype 1: Direct L1 Auction Proof

This is closest to v1.

It contains:

- Bitcoin chain anchor
- accepted bid transactions
- winner derivation
- settlement/bond proof
- owner-key binding
- value-record chain

This is the reference model. The other prototypes should be judged by how close
they can get to this verification clarity.

## Prototype 2: Ark Auction Transcript Proof

This keeps ONT auction rules but moves bid collateral and transcript management
off L1.

It contains:

- Ark batch transcript commitment
- bid entries with VTXO collateral proofs
- Merkle inclusion paths
- winner derivation
- L1 settlement bond

This is probably the best first Ark experiment because it reduces bid churn
without changing final L1 ownership.

## Prototype 3: Ark Sponsored Claim Proof

This models sponsor credits as an optimistic batch/challenge path.

It contains:

- sponsor capital account or VTXO proof
- BTC-time / credit eligibility proof
- credit spend transition
- sponsored name claim
- recipient acceptance
- batch inclusion proof
- challenge-window proof
- final owner key

The preferred shape is one sponsor/bond VTXO supporting many claims. The name
claim itself should not need its own VTXO unless challenged or hardened.

This is the biggest scaling candidate, but also the one with the most unresolved
proof and data-availability questions.

## Prototype 4: RGB-Style State Transition Proof

This treats ONT ownership as a client-side validated state transition chain.

It contains:

- schema id
- genesis commitment
- single-use seals
- transition chain
- latest owner key
- value-record chain

RGB is useful here less as "the place names live" and more as discipline for
portable validation: schemas, seals, consignments, and commitment-linked state.

The hard question is public discovery and data availability. ONT names are a
public namespace; a proof system that only works when the owner hands you a
private consignment is not enough by itself.

## What We Learn From These Fixtures

The common verification target is:

> Can a fresh verifier explain why this owner controls this name?

The direct L1 fixture is clear but expensive.

The Ark auction fixture may be clear enough if VTXO collateral and transcript
availability are strong.

The Ark sponsored fixture scales best, but only if BTC-time, credit spends,
challenge windows, and no-challenge finality are objectively verifiable.

The RGB-style fixture may make proof structure cleaner, but it does not solve
public availability by itself.

## Next Step

The repo now includes a tiny structural verifier for these fixtures:

```sh
npm run dev -w @ont/cli -- inspect-proof-bundle fixtures/proof-bundles/direct-l1-auction-proof.json
```

It checks:

- required top-level fields
- source-specific proof sections
- owner-key continuity
- value-record ownership references
- challenge-window status for sponsored claims

That verifier does not prove real Bitcoin/Ark/RGB validity yet. It forces the
bundle shape to become precise enough that real verification can later plug in.
