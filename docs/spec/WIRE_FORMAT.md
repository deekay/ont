# ONT wire format

> **Normativity: `candidate`** — per the clean-build (#46) ledger
> ([SOFTWARE_INVENTORY.md](../core/SOFTWARE_INVENTORY.md)). No section of
> this file is `normative` yet: rules here become law only by surviving the
> five-step normative hardening for the phase that implements them
> (hardens for B1).

**Reserved — content lands via the G1 named spec PR.** This is the spec
file that gap G1 of [B1_WIRE_HARDENING.md](../core/B1_WIRE_HARDENING.md)
requires: today the event frame, version-reject rule, exhaustive event-type
enumeration, per-event byte layouts, endianness, canonical-name-bytes rule,
domain-separation labels, and the auction-bid name-flag rule exist only in
`packages/protocol` source and tests. After the B1 hardening pass settles
the invariants, they are written here as spec text and this banner is
replaced. Until then this file intentionally states no rules, so nothing
can cite it as authority.
