# ONT Launch Spec v0

Status: Historical archive.

This file used to contain the provisional auction-first launch spec: every valid
name opened through a public bonded auction. That model was useful during
exploration, but it is no longer the current launch direction.

Current references:

- [`../../../ONT.md`](../../../ONT.md) — plain-language source of truth
- [`../../../design/ONT_ACQUISITION_STATE_MACHINE.md`](../../../spec/ONT_ACQUISITION_STATE_MACHINE.md) —
  current acquisition reference
- [`ONT_LAUNCH_V1_BRIEF.md`](../ONT_LAUNCH_V1_BRIEF.md) — current launch/review brief
- [`CONTESTED_AUCTION_REFERENCE.md`](../../../spec/CONTESTED_AUCTION_REFERENCE.md) —
  current contested-auction reference

Historical note:

The auction-first model solved an important neutrality problem by removing
reserved lists, but it made ordinary long-tail acquisition too heavy and left too
much of the scaling story in conflict with the launch path. The current model
keeps the neutrality benefit while making auctions an escalation for contested
names: public claim first, accumulator finality if uncontested, L1 bonded auction
only if contested.
