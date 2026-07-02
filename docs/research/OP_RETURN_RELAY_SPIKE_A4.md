# A4: OP_RETURN standardness and relay spike

> Status: findings note. Worktree: `codex/a4-opreturn-relay` at `6856f5e8`.
> Date: 2026-07-02. No policy decision is made here.

## Verdict

ONT's current `RootAnchor` carrier relays under the target Bitcoin Core default
policy pinned by the repo (`btcpayserver/bitcoin:28.1`). The `RootAnchor` wire
payload is 73 bytes, the publisher's OP_RETURN scriptPubKey is 75 bytes, and
Bitcoin Core v28.1 accepts it under the default `-datacarrier=1`
`-datacarriersize=83` policy.

The 184-byte number is the maximum ONT event envelope, not the current
`RootAnchor` carrier. The only carrier broadcasting today is `RootAnchor`, so
the finding is not a live-production break. It is a pre-LE-INVOKE gate for the
built `RecoverOwner` invoke assembler: if that 171-byte event is broadcast as a
single OP_RETURN output, it does not relay under Bitcoin Core v28.1 defaults.
Representative `Transfer` and max-name `AuctionBid` OP_RETURN carriers also
fail default policy. The same raw transactions pass when the node is restarted
with `-datacarriersize=1000`, which isolates the failure to datacarrier policy.

Go/no-go:

- Go for the current `RootAnchor` anchor carrier under target Core v28.1 default
  relay policy.
- No-go for the built `RecoverOwner` invoke carrier, or any other 135-184 byte
  OP_RETURN event carrier, under target Core v28.1 defaults without an explicit
  fallback or operator policy change.

## Sizes pinned from ONT docs and code

Sources:

- `docs/spec/WIRE_FORMAT.md` section 4: `Transfer` 135 bytes, `RecoverOwner`
  171 bytes, `AuctionBid` up to 184 bytes, `RootAnchor` 73 bytes, and max event
  size 184 bytes.
- `packages/wire/src/index.ts`: live event types and `MAX_EVENT_BYTES = 184`;
  `encodeEvent` emits the same fixed-size layouts.
- `packages/adapter-publisher/src/assemble-root-anchor.ts`: `RootAnchor`
  vout 0 is `6a49 + payloadHex`, so scriptPubKey bytes are `1 + 1 + 73 = 75`.
- `packages/adapter-publisher/src/assemble-recover-owner-invoke.ts`:
  `RecoverOwner` vout 0 is `6a4cab + payloadHex`, so scriptPubKey bytes are
  `1 + 2 + 171 = 174`.

Active publisher assemblers currently cover `RootAnchor` and `RecoverOwner`
invoke. `docs/core/STATUS.md` lists LE-INVOKE / LE-CONTESTED as still ahead, so
`RecoverOwner` is a built pre-ship carrier, not a current live broadcast.
`Transfer` and max `AuctionBid` do not have active publisher OP_RETURN
assemblers; below they are representative ONT wire payloads placed into a
standard single data output for policy testing.

## Target Bitcoin Core policy

The repo's default node target is Bitcoin Core v28.1:

- `.env.example`: `BITCOIND_IMAGE=btcpayserver/bitcoin:28.1`.
- `docker-compose.yml`: bitcoind image defaults to
  `${BITCOIND_IMAGE:-btcpayserver/bitcoin:28.1}`.

Bitcoin Core v28.1 policy source:

- [`policy.h`](https://github.com/bitcoin/bitcoin/blob/v28.1/src/policy/policy.h#L66-L72):
  `DEFAULT_ACCEPT_DATACARRIER = true`; `MAX_OP_RETURN_RELAY = 83`, described as
  80 bytes of data plus OP_RETURN and pushdata opcodes.
- [`policy.cpp`](https://github.com/bitcoin/bitcoin/blob/v28.1/src/policy/policy.cpp#L70-L88):
  NULL_DATA scripts fail standardness when `scriptPubKey.size()` exceeds the
  configured `max_datacarrier_bytes`.
- [`policy.cpp`](https://github.com/bitcoin/bitcoin/blob/v28.1/src/policy/policy.cpp#L131-L153):
  nonstandard output scripts return `scriptpubkey`, and more than one OP_RETURN
  returns `multi-op-return`.

The local v28.1 binary help agrees:

```text
-datacarrier
     Relay and mine data carrier transactions (default: 1)

-datacarriersize
     Relay and mine transactions whose data-carrying raw scriptPubKey is of
     this size or less (default: 83)
```

## Empirical test

Environment:

- Bitcoin Core v28.1.0 mac arm64 binary from bitcoincore.org, ad-hoc signed
  locally so macOS would execute it.
- Regtest node, RPC port 18447, wallet-funded P2WPKH transactions.
- Each transaction has one OP_RETURN output and one wallet change output.
- Raw transactions were first checked under default policy, then the same raw
  transactions were checked after restarting the same node with
  `-datacarriersize=1000`.
- Artifacts: `/private/tmp/ont-a4-bitcoin/results/`.

| Event payload | Payload bytes | OP_RETURN script bytes | Measured vsize | v28.1 default policy | v28.1 `-datacarriersize=1000` |
| --- | ---: | ---: | ---: | --- | --- |
| `RootAnchor` (`0x0b`) | 73 | 75 | 206 | accepted | accepted |
| `Transfer` (`0x03`) | 135 | 138 | 269 | rejected: `scriptpubkey` | accepted |
| `RecoverOwner` (`0x09`) | 171 | 174 | 305 | rejected: `scriptpubkey` | accepted |
| max `AuctionBid` (`0x07`) | 184 | 187 | 318 | rejected: `scriptpubkey` | accepted |

The `RootAnchor` representative tx measured 206 vB in this wallet-funded shape.
That is above the R11 162-194 vB prototype range; the exact vsize is funding
shape dependent, while the relay decision here is driven by the OP_RETURN
script size. `RootAnchor` remains below the v28.1 83-byte data-carrier standard
limit.

## Fallbacks and DK decision

Fallbacks before ONT ships the larger `RecoverOwner` invoke carrier, or any
other larger on-chain event carrier, under the current v28.1 target:

1. Require operators to run with `-datacarrier=1` and a raised
   `-datacarriersize` at least 187. A round value such as 1000 was tested.
2. Use direct-to-miner or other non-default relay paths for the larger carriers.
   This is not equivalent to public default relay.
3. Shrink the larger carrier formats below the v28.1 default data-carrier limit.
   That means fitting inside an 83-byte scriptPubKey, not merely below
   184 bytes, and would require a wire-format redesign for 135-184 byte events.
4. Move the target node policy forward only if DK wants ONT to depend on newer
   Core defaults. That is a product/operator target decision, not a property of
   the current `btcpayserver/bitcoin:28.1` default.

Decision needed from DK:

- Treat `RootAnchor` as default-relay safe and leave the target at v28.1, while
  explicitly requiring a raised datacarrier policy before LE-INVOKE can ship; or
- change the target node/policy requirement; or
- shrink/avoid the larger OP_RETURN carriers.

This closes the R11 "live broadcast" question for the current `RootAnchor`
carrier under the named target version, and leaves a clear no-go for larger
135-184 byte OP_RETURN carriers under that same default policy.

Doc-truth follow-up when the policy decision lands: `docs/core/STATUS.md`
currently says the 171/184-byte OP_RETURN sizes "relies on modern node policy."
For the repo's pinned target (`btcpayserver/bitcoin:28.1`), the precise claim is
stricter: RootAnchor relays by default; 171/184-byte carriers need a raised
`-datacarriersize`, a different target policy, or a carrier redesign.
