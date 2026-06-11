# ONT Launch Direction Status

Status: Historical archive.

This file used to summarize the auction-first launch posture. It is preserved so
provenance is preserved, but it is no longer the current launch direction.

Current references:

- [`../../../ONT.md`](../../../ONT.md) — plain-language source of truth
- [`../../../design/ONT_ACQUISITION_STATE_MACHINE.md`](../../../spec/ONT_ACQUISITION_STATE_MACHINE.md) —
  current acquisition reference
- [`ONT_LAUNCH_V1_BRIEF.md`](../ONT_LAUNCH_V1_BRIEF.md) — current launch/review brief
- [`CONTESTED_AUCTION_REFERENCE.md`](../../../spec/CONTESTED_AUCTION_REFERENCE.md) —
  current contested-auction reference

Current launch posture:

- every valid name enters through the same public claim path
- the claim is provisional during a notice window
- an uncontested claim finalizes through the Bitcoin-anchored accumulator
- a contested claim escalates to the L1 bonded auction path
- there is no semantic reserved-name list, founder allocation, launch wave,
  whitelist, or token

Why the earlier auction-first posture changed:

- it was clean for contested names
- it avoided subjective reserved-list governance
- but it made ordinary long-tail claims inherit too much bonded-auction weight
- it conflicted with the current scaling direction, where uncontested claims
  should batch cheaply and contested names should pay the L1 auction cost

The contested auction mechanism remains important. It is now the escalation path,
not the ordinary entry path.
