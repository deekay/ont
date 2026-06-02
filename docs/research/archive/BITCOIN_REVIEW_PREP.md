# Bitcoin Review Prep

This note is the practical checklist for getting ONT into a clean state before
sharing it with technically sophisticated Bitcoin reviewers.

Related notes:

- [BITCOIN_EXPERT_ONE_PAGER.md](./BITCOIN_EXPERT_ONE_PAGER.md)
- [BITCOIN_EXPERT_REVIEW_PACKET.md](./BITCOIN_EXPERT_REVIEW_PACKET.md)
- [BITCOIN_PROTOCOL_REVIEW_QUESTIONS.md](./BITCOIN_PROTOCOL_REVIEW_QUESTIONS.md)

## Reading Order

The current recommended reading order is:

1. [BITCOIN_EXPERT_ONE_PAGER.md](./BITCOIN_EXPERT_ONE_PAGER.md)
2. [ONT_FROM_ZERO.md](../core/ONT_FROM_ZERO.md)
3. [BITCOIN_EXPERT_REVIEW_PACKET.md](./BITCOIN_EXPERT_REVIEW_PACKET.md)
4. [ONT_IMPLEMENTATION_AND_VALIDATION.md](./ONT_IMPLEMENTATION_AND_VALIDATION.md)
5. [BITCOIN_PROTOCOL_REVIEW_QUESTIONS.md](./BITCOIN_PROTOCOL_REVIEW_QUESTIONS.md)

Then use the deeper appendices only as needed.

## Refresh Checklist

Before sending the packet around, we should refresh evidence and live surfaces.

First make sure repo and deploy state are boring:

- working tree is clean except for intentional, reviewed changes
- docs do not contain machine-local `/Users/...` links
- private signet is the only live demo chain presented as active
- any VPS deploy is from a known Git SHA, not an anonymous local rsync

The intended shortcut is:

```bash
npm run review:refresh
```

If you only want the local packet refresh without remote private-signet or
regtest targets, use:

```bash
npm run review:refresh:local
```

That script:

- reruns local package tests
- reruns the fixture browser E2E smoke, including the configured
  multi-resolver value fanout/lagging-resolver browser path
- reruns private-signet auction smoke if private-signet SSH env is configured
- refreshes the private auction phase gallery

## Manual Spot Checks

After the refresh run, check:

- [https://opennametags.org/api/health](https://opennametags.org/api/health)
- [https://opennametags.org/api/names](https://opennametags.org/api/names)
- [https://opennametags.org/api/private-auction-smoke-status](https://opennametags.org/api/private-auction-smoke-status)
- [https://opennametags.org/auctions](https://opennametags.org/auctions)

## What We Should Say Out Loud

The clean current stance is:

- compactness work should follow the public claim and auction-escalation
  transaction shapes, not precede them
- one public claim path is the current lead launch direction
- no reserved-word list, pre-launch reservation system, or separate ordinary
  lane is part of the current launch plan
- contested names use the same auction rule, with objective floor calibration
  still under review for the bonded path
- auction mechanics are implemented enough to inspect and critique, but some
  numbers are still calibration placeholders
- transfer sales have CLI-backed atomic handoff flows, but the browser is still
  not the final two-party PSBT wizard
- private signet and regtest are the real live/demo and exhaustive test lanes

That is enough to begin informed external review without pretending every open
question is already closed.
