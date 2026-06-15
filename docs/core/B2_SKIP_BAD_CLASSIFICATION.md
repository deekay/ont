# B2 Skip-Bad Byte Classification — same-block-order (#55) / one-anchor-per-tx (#54)

> **Normativity: `candidate`** (per normative-hardening). Operationalizes DK's
> ratified **skip-bad** ruling (same-block-order (#55), one-anchor-per-tx (#54),
> 2026-06-14) into exact byte-level consensus behavior — turning "ignore junk"
> into a hard, razor-crisp boundary (DK's directive). Drafted by ChatLunatique
> (adversarial guardrail lane), formalized by ClaudeleLunatique. The B2 kernel
> implementation cites this; promotion to `normative` follows the 5-step
> hardening at B2 kernel freeze.

## Proposed rule

B2 scans Bitcoin transaction outputs in ascending `vout` order. For each OP_RETURN
payload:

1. If the payload is not ONT-shaped, ignore it.
2. If it is ONT-shaped but not a valid active-version ONT event, classify it as
   invalid and give it **zero side effects**.
3. Valid active-version ONT events apply in same-block-order (#55) unless a
   higher-level multiplicity rule rejects the whole transaction (e.g.
   one-anchor-per-tx (#54)'s `>1` valid RootAnchor rule).

**Skip-bad** means invalid or non-ONT outputs do not poison valid sibling outputs.
It does **not** mean malformed bytes partially decode, reserve state, consume an
outpoint, count as a RootAnchor, open a window, count toward a bid transcript, or
create any future-version effect.

## Classification table

| Payload shape | Classification | Effect under skip-bad | Required vector |
| --- | --- | --- | --- |
| Non-OP_RETURN output | Non-ONT | Ignored by ONT scan. | Tx with ordinary outputs and one valid ONT event still applies only the ONT event. |
| OP_RETURN with no data | Non-ONT | Ignored. | Empty OP_RETURN beside valid event has no effect. |
| OP_RETURN data shorter than 3 bytes | Non-ONT | Ignored. | Short junk beside valid event has no effect. |
| First 3 bytes not `ONT` | Non-ONT | Ignored. | Non-ONT protocol payload beside valid event has no effect. |
| Magic `ONT`, missing version byte | Invalid ONT-shaped | Zero side effects; sibling valid events still apply. | Truncated frame skipped; sibling event applies. |
| Magic `ONT`, missing type byte | Invalid ONT-shaped | Zero side effects; sibling valid events still apply. | Truncated frame skipped; sibling event applies. |
| Magic `ONT`, version not active (`!= 0x01` today) | Inactive-version ONT-shaped | Zero side effects under current rules; sibling active-version events still apply. No future version may become consensus-effective without an activation rule. | v2-like payload beside v1 event is ignored before activation; activation test must change behavior only after named activation. |
| Active version, unknown type | Invalid/reserved ONT-shaped | Zero side effects; sibling valid events still apply. | Unknown type skipped; does not reserve type or count as malformed valid event. |
| Active version, retired type `0x0d` | Invalid retired ONT-shaped | Zero side effects; sibling valid events still apply. | AvailabilityMarker payload rejected/skipped; no deadline marker effect (marker-fold (#47)). |
| Correct type, too short for fixed layout | Invalid ONT-shaped | Zero side effects; sibling valid events still apply. | Truncated Transfer/RecoverOwner/AuctionBid/RootAnchor skipped; no partial state. |
| Correct type, too long / trailing bytes | Invalid ONT-shaped | Zero side effects; sibling valid events still apply. | RootAnchor plus one trailing byte skipped; sibling event applies. |
| Correct type, wrong field canonicality | Invalid ONT-shaped | Zero side effects; sibling valid events still apply. | Non-canonical name in AuctionBid skipped; no transcript entry. |
| Correct type, numeric overflow or invalid bounded value | Invalid ONT-shaped | Zero side effects; sibling valid events still apply. | Bad `successorBondVout`/sequence-style bounded field skipped where applicable. |
| Active-version valid event that later fails semantic predicate | Valid decodable event; semantic reject | Participates only as a rejected event under kernel rules; no state mutation. It is **not** "bad bytes." | Valid Transfer with wrong signature rejects but sibling valid event still applies unless same-outpoint/order rule says otherwise. |
| Multiple valid non-anchor ONT events in one tx | Valid events | Apply in ascending vout order under same-block-order (#55). | Transfer/recovery/bid ordering vector by vout. |
| One valid RootAnchor plus valid non-anchor ONT events | Valid events with one anchor | Allowed unless a separate rule forbids the combination; RootAnchor is the single anchor for one-anchor-per-tx (#54) fee attribution. | One RootAnchor plus Transfer confirms only intended ordered effects. |
| One valid RootAnchor plus malformed/non-ONT outputs | One valid anchor; bad outputs skipped | Anchor remains valid; bad outputs do not count toward the one-anchor limit. | Valid anchor plus malformed ONT-shaped output accepts anchor if all other predicates pass. |
| More than one valid decodable RootAnchor in one tx | one-anchor-per-tx (#54) violation | **Reject all ONT effects of the transaction** (whole-tx ONT reject — the ratified no-partial-fee-attribution rule). | Two valid RootAnchors in one tx produce no accepted anchor and no sibling side effects. |
| Two valid events consume same outpoint/head | Valid events; same-outpoint contention | Earliest in same-block-order (#55) consumes; later event rejects. | Same successor bond vout targeted twice; first wins, second rejects. |
| Duplicate identical valid event in later vout | Valid duplicate | Handled by event-specific idempotence/no-op rule; not "bad bytes." | Duplicate RootAnchor/newRoot no-op rejects per root-chain-linkage (#53); duplicate same-owner claim idempotent per PR-6. |

## Future-version gating rule

The dangerous case is a transaction that v1 nodes skip but v2 nodes process — an
accidental hardfork if v2 semantics become active on the same chain without an
activation rule.

> Active event versions are a consensus parameter with an **activation height**. A
> payload whose ONT frame version is not active at the evaluated height is invalid
> for that height and has **zero side effects**. Future versions MUST NOT become
> consensus-effective merely because new software understands them; they require a
> named activation rule and vectors showing pre-activation skip and post-activation
> process behavior. Before activation, a future-version payload is skipped exactly
> like any other invalid ONT-shaped output.

This keeps v1 "skip-bad" safe: v1 skipping version 2 is only safe while version 2
is not active. Once version 2 activates, old v1 validators are *intentionally*
outside the new consensus, not silently compatible.

## Zero-partial-side-effects guarantee

For every invalid ONT-shaped output:

- It does not reserve a name, owner key, state head, outpoint, bond, auction lot, or
  transcript slot.
- It does not count as a RootAnchor, AuctionBid, Transfer, RecoverOwner, claim, bond,
  marker, cancel, or value record.
- It does not contribute to `batchSize`, gate-fee sum, bid set, nullification count,
  same-outpoint contention, or min-increment basis.
- It does not start or reset any deadline.
- It does not affect sibling valid events except through the explicit whole-transaction
  one-anchor-per-tx (#54) multiplicity rule for `>1` valid RootAnchor.

## Decoder / kernel boundary

Keep these layers separate:

- **Wire decoder:** byte validity for an active-version event. Invalid bytes produce
  "no event."
- **Transaction scanner:** orders valid decoded events by `(height, tx-index, vout)`
  and records invalid/non-ONT outputs only for diagnostic evidence, not consensus
  effects.
- **Kernel predicate:** applies valid decoded events and may semantically reject them.

This matters because a validly decoded but unauthorized Transfer is **not** "bad
bytes" and must be included in same-outpoint/order reasoning as a rejected valid
event. A truncated Transfer **is** bad bytes and has zero effect.

## Minimum vector set

- Non-ONT OP_RETURN beside valid event.
- `ONT` truncated at each frame byte.
- Unsupported version beside valid event.
- Unknown active-version type beside valid event.
- Retired `0x0d` beside valid RootAnchor.
- RootAnchor truncation at each fixed-field boundary.
- RootAnchor with trailing byte.
- AuctionBid with non-canonical uppercase name.
- Valid unauthorized Transfer beside valid authorized Transfer.
- One valid RootAnchor plus malformed ONT-shaped output.
- Two valid RootAnchors in one tx.
- Future-version payload pre-activation skipped.
- Future-version payload post-activation processed only under named activation.
