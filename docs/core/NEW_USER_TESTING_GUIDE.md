# New User Testing Guide

Use this guide when someone wants to try ONT for the first time and give useful
feedback without reading the whole repository.

The goal is not just to prove that commands pass. The goal is to learn where the
product is clear, where it is confusing, and which parts still feel too fragile
for a serious launch.

## ONT In One Minute

ONT has three moving pieces:

- the wallet key controls the Bitcoin used for bids, bonds, and transfers
- the owner key controls the name after acquisition and signs destination
  records
- the website and resolver help people inspect chain state and publish signed
  records, but they should not control the user's Bitcoin

The hosted demo uses private signet coins. They are for testing only and are not
real BTC.

## What You Need

For the hosted demo:

- Sparrow Wallet
- 15 to 30 minutes
- no real Bitcoin
- the hosted site at `https://opennametags.org`

For local code checks:

- Node.js 22 or newer
- npm 11 or newer
- a terminal in the repository root

For deeper wallet testing:

- Sparrow running in `signet` mode
- Sparrow set to `Private Electrum`
- the hosted server settings shown on the setup page

## Pick A Testing Path

| Path | Best for | Time | Needs wallet? |
| --- | --- | ---: | --- |
| Hosted demo walkthrough | First-time product feedback | 15-30 min | Yes |
| Local product smoke | Check the website and resolver locally | 10-20 min | No |
| Automated checks | Confirm code health | 10-20 min | No |
| CLI simulations | Review auction behavior | 5-15 min | No |
| Private signet operator smoke | Exercise live demo infrastructure | 20+ min | Yes |

## Path A: Hosted Demo Walkthrough

Use this path for friends, reviewers, and first-time testers.

1. Open `https://opennametags.org/setup`.
2. Quit Sparrow if it is already open, then start it in signet mode:

```sh
open /Applications/Sparrow.app --args -n signet
```

3. In Sparrow, create or open a demo wallet.
4. In Sparrow `Settings -> Server`, choose `Private Electrum`.
5. Enter the hosted server settings shown on the setup page.
6. Copy a fresh Sparrow receive address and request demo coins.
7. Open `https://opennametags.org/auctions`.
8. Pick an eligible name or active auction and prepare a bid package.
9. Save any owner-key or recovery material the site gives you.
10. Open the generated PSBT in Sparrow, review it, sign it, and broadcast it.
11. After settlement, find the name in `https://opennametags.org/explore`.
12. Open `https://opennametags.org/values` and publish a simple destination
    record for that name.

Success looks like:

- Sparrow shows a funded private-signet wallet
- the auction package is understandable enough to review before signing
- Sparrow signs and broadcasts the transaction
- the name appears in Explore after settlement
- the destination record appears on the name detail page

Important feedback to collect:

- Where did the tester hesitate?
- Did the owner-key and recovery material feel clear enough to save?
- Did Sparrow show enough information to trust the PSBT?
- Did the website explain what was happening before money moved?
- Did anything look mainnet-like enough to feel risky or misleading?

## Path B: Local Product Smoke

Use this path when someone wants to run the website and resolver locally.

Install dependencies:

```sh
npm install
```

Start the local website and resolver:

```sh
npm run dev:all
```

Open:

- `http://127.0.0.1:3000/`
- `http://127.0.0.1:3000/setup`
- `http://127.0.0.1:3000/auctions`
- `http://127.0.0.1:3000/explore`
- `http://127.0.0.1:3000/values`
- `http://127.0.0.1:3000/transfer`

Success looks like:

- pages load without console-breaking errors
- the auction page explains current name state and bid preparation
- the setup page points users toward the private signet demo
- the values page makes destination-record publishing understandable
- `/claim` redirects to `/auctions`

## Path C: Automated Checks

Run the full suite:

```sh
npm test
```

Run the browser fixture smoke:

```sh
npm run test:e2e:fixture-web
```

Generate the local review refresh without private-signet or regtest smokes:

```sh
npm run review:refresh:local
```

Success looks like:

- `npm test` passes across all workspaces
- the fixture web smoke can launch Chromium in the current environment
- the review refresh completes without requiring access to the live demo server

If Chromium cannot launch in a sandboxed environment, rerun the browser fixture
from a normal shell or CI before treating it as a product failure.

## Path D: CLI Auction Simulations

Inspect the current auction policy:

```sh
npm run dev:cli -- print-auction-policy
```

Run a single auction fixture:

```sh
npm run dev:cli -- simulate-auction fixtures/auction/lab/04-soft-close-marble.json
```

Run a market-pressure scenario:

```sh
npm run dev:cli -- simulate-auction-market fixtures/auction/market-capital-pressure.json
```

Success looks like:

- the policy output is understandable
- the fixture result matches the expected winner and settlement behavior
- the market scenario exposes capital-pressure behavior without crashing

## Path E: Private Signet Operator Smoke

Use this only when testing the live demo infrastructure rather than a normal
new-user walkthrough.

Start with:

- [SPARROW_PRIVATE_SIGNET.md](../demo/SPARROW_PRIVATE_SIGNET.md)
- [TESTING.md](./TESTING.md)

Useful commands:

```sh
npm run test:private-signet-auction-smoke
npm run test:private-signet-auction-phase-gallery
```

These checks may require access to the current private signet environment.

## What To Report

For each test pass, record:

- date and tester name
- path tested
- operating system, browser, and wallet version
- name attempted, if any
- package file, transaction id, or resolver URL, if useful
- what the tester expected to happen
- what actually happened
- screenshots or terminal output for failures
- open questions the tester had while using the flow

Good feedback is often basic. "I was not sure which key mattered here" is more
useful than "the flow failed" because it points directly at what needs better
product design.

## Known Boundaries

- ONT is not mainnet-ready.
- The hosted walkthrough is private signet only.
- Sparrow is the supported wallet for the current hosted demo.
- The official Electrum app is not supported for this hosted private signet
  walkthrough.
- Transfers are still prototype-level.
- Product recovery UX is still maturing. Treat owner-key and recovery-material
  clarity as an important part of testing.

