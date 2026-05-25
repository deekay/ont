# Testing

For a plain-English guide that is easier to hand to new testers, start with
[NEW_USER_TESTING_GUIDE.md](./NEW_USER_TESTING_GUIDE.md). This file is the
more technical command reference.

This guide reflects the current ONT model (see [../ONT.md](../ONT.md)): a name is
claimed for a small fixed fee and escalates to a bonded auction only when contested,
with no reserved list, separate direct-allocation lane, pre-launch reservation system,
or short-name wave. The hosted demo and most tests below exercise the bonded/contested
(auction) path, which is what runs end-to-end today.

## Core Test Commands

Run the package suites from the repository root:

```sh
npm run test -w @ont/protocol
npm run test -w @ont/core
npm run test -w @ont/cli
npm run test -w @ont/web
npm run test -w @ont/resolver
npm run test -w @ont/db
```

For a full workspace pass:

```sh
npm test
```

## What The Tests Cover Now

- `@ont/protocol`: names, bond helpers, auction bid payloads, transfer authorization, transfer packages, and signed destination records.
- `@ont/core`: auction policy, auction state, auction fixtures, market simulations, and stale bid handling.
- `@ont/cli`: auction bid artifact building/signing, transfer flows, destination-record publishing, resolver fetch helpers, and package review.
- `@ont/web`: page shell copy, auction lab rendering, browser key tools, destination publishing bundle, client script syntax, and resolver fanout.
- `@ont/resolver`: resolver HTTP behavior and chain-derived surfaces.
- `@ont/db`: snapshot persistence and database client config.

## Website Checks

Local dev:

```sh
npm run dev:web
```

Then open:

- `http://127.0.0.1:3000/`
- `http://127.0.0.1:3000/auctions`
- `http://127.0.0.1:3000/explore`
- `http://127.0.0.1:3000/setup`
- `http://127.0.0.1:3000/values`
- `http://127.0.0.1:3000/transfer`

The retired direct-claim route, `/claim`, should redirect to `/auctions`.

## Auction CLI Smoke

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

Create and inspect a bid package:

```sh
npm run dev:cli -- create-auction-bid-package fixtures/auction/lab/04-soft-close-marble.json \
  --bidder-id operator_alpha \
  --amount-sats 1800000000 \
  --write /tmp/ont-auction-bid.json

npm run dev:cli -- inspect-auction-bid-package /tmp/ont-auction-bid.json
```

The `--amount-sats` flag is a low-level CLI/API name from the transaction
builder. Public UI and docs should show user-facing amounts in ₿.

## Transfer And Destination Smoke

Transfer package review:

```sh
npm run dev:cli -- inspect-transfer-package /path/to/package.json --role buyer
```

Destination-record signing and publishing:

```sh
npm run dev:cli -- sign-value-record \
  --name alice \
  --owner-private-key-hex <hex32> \
  --resolver-url http://127.0.0.1:8787 \
  --value-type 2 \
  --payload-utf8 https://example.com/alice \
  --write /tmp/alice-value.json

npm run dev:cli -- publish-value-record /tmp/alice-value.json \
  --resolver-url http://127.0.0.1:8787
```

The `sign-value-record` and `publish-value-record` command names are legacy
low-level CLI names. Public copy should describe this as destination-record
signing and publishing.

## Retired Paths

The old direct-allocation preparation path is retired. Tests should not assert
success for that hidden-name staging family of flows. If an old endpoint is kept
temporarily for link compatibility, it should return a retirement response and
point users to auctions.
