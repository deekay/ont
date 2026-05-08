# New User Testing Guide

Use this guide when someone is trying ONT for the first time and you want useful
product feedback without asking them to read the whole repository.

The goal is not just to prove that a transaction can be built. The goal is to
learn where the product is clear, where it is confusing, and which parts still
feel too fragile for a serious launch.

## ONT In One Minute

ONT has three moving pieces:

- the Sparrow wallet controls the private signet bitcoin used for bids and
  bonds
- the ONT owner key controls the name after acquisition and signs destination
  records
- the website and resolver help people inspect chain state and publish signed
  records, but they should not control the user's Bitcoin

The hosted demo uses private signet coins. They are for testing only and are not
real BTC.

## What You Need

- Sparrow Wallet
- 15 to 30 minutes
- no real Bitcoin
- the hosted site at `https://opennametags.org`

If Sparrow is not installed yet, download it from
`https://sparrowwallet.com/download/`.

## Hosted Demo Walkthrough

Use this walkthrough for friends, reviewers, and first-time testers.

1. Open `https://opennametags.org/setup`.
2. Quit Sparrow if it is already open.
3. Start Sparrow in signet mode:

```sh
open /Applications/Sparrow.app --args -n signet
```

4. In Sparrow, create or open a demo wallet.
5. In Sparrow `Settings -> Server`, choose `Private Electrum`.
6. Enter the hosted server settings shown on the setup page.
7. In Sparrow, open `Receive` and copy a fresh receive address.
8. Paste that address into the setup page and request demo coins.
9. Refresh Sparrow and confirm the demo balance appears in that same wallet.
10. Open `https://opennametags.org/auctions`.
11. Check a name, then use the auction page to prepare the next available bid.
12. Create, download, and confirm the ONT recovery kit before building the
    transaction.
13. In Sparrow, open the `UTXOs` tab and copy the `Output` value for the coin
    you want to spend.
14. Paste that `Output` value into the auction page and build the Sparrow PSBT.
15. Open the generated PSBT in Sparrow with `File -> Open Transaction`.
16. Review the bond and change outputs. Sign only if the addresses are from your
    Sparrow wallet.
17. Broadcast from Sparrow.
18. Record the transaction id and what the auction page says should happen
    next.
19. Check `https://opennametags.org/explore` later after enough private-signet
    blocks advance.
20. If a settled name is available, open `https://opennametags.org/values` and
    publish a simple destination record for that name.

The hosted private signet advances faster than Bitcoin mainnet, but auction
settlement will usually happen after the first testing session. Stop after
broadcast and record what happened. That is still useful feedback.

## Success Looks Like

- Sparrow shows a funded private-signet wallet.
- The auction page explains the next bid clearly enough to review.
- The recovery kit and owner key material are clearly worth saving.
- Sparrow opens the PSBT and shows understandable outputs.
- Sparrow signs and broadcasts the transaction.
- The tester understands that settlement happens after more private-signet
  blocks advance.
- If a settled name is available, a destination record can be published and seen
  on the name detail page.

## Feedback To Collect

- Where did the tester hesitate?
- Did the setup steps feel short enough to follow?
- Did the owner-key and recovery material feel clear enough to save?
- Did Sparrow show enough information to trust the PSBT?
- Did the website explain what was happening before any demo coins moved?
- Did anything look mainnet-like enough to feel risky or misleading?
- What did the tester expect to happen next after broadcast?

Good feedback is often basic. "I was not sure which key mattered here" is more
useful than "the flow failed" because it points directly at what needs better
product design.

## What To Report

For each test pass, record:

- date and tester name
- operating system, browser, and Sparrow version
- name attempted, if any
- transaction id, package file, or resolver URL, if useful
- what the tester expected to happen
- what actually happened
- screenshots or terminal output for failures
- open questions the tester had while using the flow

## Known Boundaries

- ONT is not mainnet-ready.
- The hosted walkthrough is private signet only.
- Use demo coins only.
- Sparrow is the supported wallet for the current hosted demo.
- The official Electrum app is not supported for this hosted private signet
  walkthrough.
- Transfers are still prototype-level.
- Product recovery UX is still maturing. Treat owner-key and recovery-material
  clarity as an important part of testing.
