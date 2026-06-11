# Sparrow Setup For The Private Signet Demo

This is the cleanest way to make Sparrow talk to the hosted private ONT demo network behind [https://opennametags.org](https://opennametags.org).

## The Short Version

For the private demo:

- Sparrow should run in `signet` mode
- create or open a Sparrow wallet before looking for a receive address
- a new demo wallet can use Sparrow's BIP39 12-word software-wallet path
- Sparrow's server type should be `Private Electrum`, not `Public Server`
- the server string should match the one shown on the hosted setup page

Why:

- the hosted ONT demo uses a **private signet**, not the shared public signet
- public Sparrow servers will not know about our private chain
- the hosted demo now exposes a public wallet endpoint while keeping Bitcoin Core RPC private on the server

## Wallet Compatibility FAQ

### Do I have to use Sparrow?

No. Open Name Tags uses PSBT-based handoffs and is not conceptually tied to Sparrow. But the current hosted private signet flow is only fully supported and tested with Sparrow.

### Does Electrum work?

Not for this hosted private demo. The official Electrum app reaches the endpoint and completes the initial handshake, but then disconnects because this private signet chain sits below Electrum's built-in public signet checkpoint height. Sparrow is still the wallet we actively support and test end to end.

### What about other wallets?

Other PSBT-capable wallets may be compatible, but they are not yet validated end to end for this private demo flow.

### Why do I need the hosted demo endpoint?

Because the hosted demo uses a private signet, not the shared public signet. Public signet servers do not know about this chain, so they will never show balances or transactions from the private demo.

### Will broader wallet support come later?

Probably. The biggest blocker used to be the SSH-only Bitcoin Core RPC path. Now that the hosted demo exposes a public wallet endpoint, validating additional wallets should be much easier, but the official Electrum app still needs a different answer for this low-height private signet design.

## One-Time Mental Model

Think of the setup like this:

- `opennametags.org` is the public website and resolver convenience layer
- the private signet `bitcoind` still stays on the VPS
- the hosted demo also runs a public wallet endpoint
- Sparrow talks to that endpoint over the normal Electrum protocol

That keeps the node private without making each demo user depend on SSH access.

## Quick Start

### 1. Open Sparrow in signet mode

Sparrow does not ask for Signet while creating a wallet. The network is chosen
when Sparrow starts. If Sparrow is already running in another network mode, quit
it fully first.

On macOS, open Terminal and run:

```bash
open /Applications/Sparrow.app --args -n signet
```

From this repo, you can also run:

```bash
./scripts/launch-sparrow-signet.sh
```

### 2. Create or open a wallet

You need an actual Sparrow wallet before Sparrow can generate a receive address.

For a quick demo wallet:

1. Create a new Sparrow wallet.
2. Choose a software wallet / new mnemonic flow.
3. Generate a fresh BIP39 12-word mnemonic.
4. Save the wallet and keep it open.

Use this same wallet for funding, signing, and broadcasting demo auction bids.

### 3. Connect Sparrow to the hosted demo wallet server

Open:

- `Settings`
- `Server`

Use these values:

- `Type`: `Private Electrum`, not `Public Server`
- `Server String`: use the value shown on the hosted setup page

Important:

- use Sparrow for this hosted walkthrough
- do not switch to the official Electrum app for this private demo path yet

The hosted root-domain walkthrough currently uses:

```text
opennametags.org:50001:t
```

If Sparrow asks for separate fields instead of a single server string, use:

- `Host`: `opennametags.org`
- `Port`: `50001`
- `SSL`: `off`

Then click the connect toggle and test the connection.

Success should mention `electrs`.

## What “Working” Looks Like

Once connected correctly:

- Sparrow stays in `Signet`
- the connection test succeeds
- funding from [https://opennametags.org/setup](https://opennametags.org/setup) lands in the Sparrow wallet
- pending auction transactions on the hosted private demo confirm automatically after broadcast
- PSBTs generated from auction bid artifacts open and sign in Sparrow

## Demo Auction Flow

Once Sparrow is connected:

1. Open [https://opennametags.org/setup](https://opennametags.org/setup)
2. Open Sparrow's `Receive` tab and copy a fresh receive address from this wallet
3. Use `Get Demo Coins`
4. Refresh Sparrow and confirm the UTXO appears
5. Open the auction page and check the name you want
6. Paste one unspent Sparrow `Output` from the UTXOs tab into the website and build the unsigned Sparrow PSBT
7. Download the PSBT and confirm you have saved the ONT recovery kit
8. In Sparrow, choose `File -> Open Transaction`, select the downloaded `.psbt` file, and review the outputs
9. Sign only if the bond and change outputs are addresses from your own Sparrow wallet
10. Broadcast from Sparrow
11. Confirm the bid appears in the hosted private demo after the next block

If you are rebidding after being outbid, paste your previous bid-bond `Output`
into the optional previous-bid field and paste a fresh unspent Sparrow `Output`
for the additional funding. The website combines those inputs into one
replacement bid, and Sparrow still shows the final outputs before you sign.

## Troubleshooting

### “The coins do not show up in Sparrow”

Usually one of these:

- Sparrow is not in `signet` mode
- the hosted demo server string is wrong
- Sparrow is still set to `Public Server`
- Sparrow is not set to `Private Electrum`
- the wallet needs a refresh/rescan

### “The website says funded, but Sparrow is empty”

Check the hosted demo server settings first. The funding step is on the private signet chain, so a public shared signet server will never see those coins.

### “Connection test fails”

Make sure:

- Sparrow is in `signet` mode
- server type is `Private Electrum`
- the hosted demo server string matches the hosted setup page
- you are not accidentally pointing Sparrow at a shared public signet server

## Legacy SSH Path

The old SSH-based Bitcoin Core path still exists for internal/operator use, but it is no longer the primary newcomer path.

Those helper scripts are:

- `/path/to/ont/scripts/start-private-signet-sparrow-session.sh`
- `/path/to/ont/scripts/open-private-signet-sparrow-tunnel.sh`
- `/path/to/ont/scripts/configure-sparrow-private-signet.sh`
- `/path/to/ont/scripts/print-private-signet-sparrow-config.sh`

They are still useful if you are operating the demo stack directly, but a normal hosted-demo user should not need them anymore.
