# Hosted Demo Script

Use this when you want to show ONT quickly to someone new without sending them through the whole repository first.

## Goal

In one short walkthrough, the person should see all three layers:

1. connect a wallet to the hosted private demo
2. acquire a name through the auction flow
3. publish destination records for that name

## Best Audience

This is the right script for:

- Flint reviewers
- technically capable friends
- first-time product testers
- anyone who wants to understand the product before reading the deeper docs

## What To Send Them

Send exactly these two links first:

- [https://opennametags.org/setup](https://opennametags.org/setup)
- [https://opennametags.org/auctions](https://opennametags.org/auctions)

If you want one sentence of framing, use:

> ONT lets you acquire a human-readable name through auction, then point it at ordered destination records you control.

## What They Need

- Sparrow Wallet
- a few minutes
- no SSH access
- no Bitcoin balance

For the hosted demo, the supported wallet path is Sparrow in `signet` mode using `Private Electrum` and the server settings shown on the setup page. This is private signet only, not mainnet.

## Fastest Walkthrough

### 1. Connect Sparrow

Open [setup](https://opennametags.org/setup).

In Sparrow:

- run in `signet` mode
- create or open a wallet first; a new BIP39 12-word software wallet is fine for demo use
- go to `Settings` → `Server`
- choose `Private Electrum`, not `Public Server`
- use the hosted demo host and port from the setup page

Then open Sparrow's `Receive` tab, copy a fresh receive address, and request demo coins into that same wallet.

Success looks like:

- Sparrow shows a confirmed demo balance
- the setup page reports successful funding

### 2. Bid For A Name

Open [auctions](https://opennametags.org/auctions).

Use:

- the same funded Sparrow wallet from setup
- a visible eligible name or active auction from the hosted demo
- a saved owner key and bid package

Then:

- preview or download the bid package
- build the signer files from that package
- sign and broadcast an auction bid in Sparrow

Success looks like:

- the name appears in [explore](https://opennametags.org/explore)
- or the detail page resolves at `/names/<your-name>`

### 3. Publish A Destination Bundle

Open [values](https://opennametags.org/values) and use a live name from Explore, or replace the name with the one just acquired through auction.

Load the acquired name, then publish a few destination entries such as:

- `website` → `https://example.com`
- `btc` → `bitcoin:bc1...`
- `chat` → `https://t.me/example`

Success looks like:

- the name detail page shows the published destination records
- sequence increments
- future updates require the owner key, not the funding wallet key

## Live Examples

If they want to inspect the product before bidding, point them at:

- [auctions](https://opennametags.org/auctions): flow examples and observed bid activity
- [explore](https://opennametags.org/explore): currently owned names and recent chain-derived events
- [destinations](https://opennametags.org/values): owner-signed records for live names

## What To Say If They Ask “What Works Today?”

Use this short answer:

- hosted private demo with Sparrow: yes
- auction bid flow: yes
- browser destination publishing: yes
- transfers: prototype
- self-hosting: yes
- mainnet-ready: not yet

## Known Boundaries

Keep these clear:

- this is a private signet demo, not mainnet
- Flint/early external review should use the private signet path first
- the hosted wallet path is Sparrow-first today
- the official Electrum app is not the right wallet for this hosted demo
- the website prepares flows, but the wallet still signs and broadcasts transactions

## If You Only Have 60 Seconds

Use this order:

1. homepage: explain the product in one sentence
2. setup: show that the wallet can connect and get demo coins
3. auctions: show how a bid package is prepared and signed
4. destinations: show what an acquired name can point to
