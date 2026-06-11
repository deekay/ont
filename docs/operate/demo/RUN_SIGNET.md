# Run Against Signet

This repo defaults to the local fixture chain. You now have two remote signet
paths:

- `rpc` mode for a real Bitcoin Core JSON-RPC node you control
- `esplora` mode for a public read-only signet backend such as
  [mempool.space signet API](https://mempool.space/signet/api)

Use `esplora` when you want to validate the live read path without running your
own node. Use `rpc` when you want the most complete and controllable write path
for auction bids, transfers, and destination updates.

If you want to run the current prototype on your own VPS, use
[VPS_SETUP.md](../VPS_SETUP.md).

## Terminal-Only Live Flow

For live testing, the cleanest prototype loop is now:

```bash
npm run dev:cli -- generate-live-account --network signet --write /path/to/live-account.json
npm run dev:cli -- create-auction-bid-package /path/to/auction-scenario.json \
  --bidder-id <local-bidder-id> \
  --owner-pubkey <owner-pubkey-hex> \
  --bid-amount-sats <amount-in-base-units> \
  --write /path/to/bid-package.json
```

The `--bid-amount-sats` flag is a low-level CLI/API name from the transaction
builder. User-facing docs and website copy show amounts in ₿.

That gives you:

- one owner key for ONT ownership and off-chain destination updates
- one funding WIF/address for signet transaction inputs
- one auction bid package ready for the signer flow

## Fastest Remote Signet Check

This is the exact public endpoint used to validate the read path:

```bash
export ONT_ESPLORA_BASE_URL="https://mempool.space/signet/api"
export ONT_EXPECT_CHAIN="signet"
TIP=$(curl -sS https://mempool.space/signet/api/blocks/tip/height)
export ONT_LAUNCH_HEIGHT="$TIP"
export ONT_RPC_END_HEIGHT="$TIP"
```

Then run:

```bash
npm run dev:indexer
```

This checks that the indexer can read signet through the configured backend.
