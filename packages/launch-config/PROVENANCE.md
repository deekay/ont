# @ont/launch-config provenance

This package carries bundled Bitcoin launch data for clients. The checkpoint is trusted only up to its
height; every header after the checkpoint is proof-of-work validated by `@ont/bitcoin`.

Scope boundary: the signet constants below are PoW-retarget inputs, a trusted launch checkpoint, and the
BIP325 default signet challenge scriptPubKey. They do not by themselves prove signet challenge satisfaction,
active-chain selection, tip freshness, or confirmation depth. Launch clients and header providers must
enforce those policies before marking an inclusion Bitcoin-verified; this package only gives them one
auditable home for the launch checkpoint, network PoW params, and later signet-solution validation input.

## Signet checkpoint

Refresh policy: refreshed per release, per `docs/core/G_TRACK_BUILD_SPINE.md` §3.

Pinned checkpoint:

| Field | Value |
| --- | --- |
| Network | signet |
| Height | `311445` |
| Hash | `00000003039bc6bf57032bcc38bbba04126f8e0dee75f5ace50e099753b51953` |
| Bits | `0x1d1539c3` (`487930307`) |
| Time | `1783028953` |
| Epoch start height | `310464` |
| Epoch start time | `1782456498` |
| Cumulative work | `eafb567b00e` |

The default signet network params come from Bitcoin Core v28.1 `src/kernel/chainparams.cpp` `SigNetParams`:

- `powLimit = 00000377ae000000000000000000000000000000000000000000000000000000`
- `nPowTargetTimespan = 14 * 24 * 60 * 60`
- `nPowTargetSpacing = 10 * 60`, so `powRetargetInterval = 2016`
- `fPowAllowMinDifficultyBlocks = false`
- `fPowNoRetargeting = false`

Source command:

```sh
curl -fsS https://raw.githubusercontent.com/bitcoin/bitcoin/v28.1/src/kernel/chainparams.cpp \
  -o /private/tmp/ont-chainparams-v28.1.cpp
sed -n '405,475p' /private/tmp/ont-chainparams-v28.1.cpp
```

## Signet challenge scriptPubKey

Pinned default challenge scriptPubKey:

```text
512103ad5e0edad18cb1f0fc0d28a3d4f1f3e445640337489abb10404f2d1e086be430210359ef5021964fe22d6f8e05b2463c9540ce96883fe3b278760f048f5189f2e6c452ae
```

This is Bitcoin Core v28.1 `SigNetParams`' default `ParseHex(...)` challenge used when no custom signet
challenge is supplied. Source command:

```sh
curl -fsS https://raw.githubusercontent.com/bitcoin/bitcoin/v28.1/src/kernel/chainparams.cpp \
  -o /private/tmp/ont-chainparams-v28.1.cpp
sed -n '407,470p' /private/tmp/ont-chainparams-v28.1.cpp
```

BIP325 defines the challenge as the signet consensus parameter `scriptPubKey`; it does not make the 80-byte
header alone sufficient to prove signet validity. This package carries the default challenge now so
`GA-SIGNET-SOLUTION` can later validate block solution material against the same launch config without a
config migration. The `canonical-header-source` tests in this slice intentionally do not consume it.

The checkpoint block and the four-header validation tail were fetched from both public signet APIs and compared.
The tail is a point-in-time active-height fixture for adapter tests, not launch trust data; a later signet
reorg can change the tail without changing the pinned checkpoint:

```sh
for H in 311445 311446 311447 311448 311449; do
  HASH=$(curl -fsS "https://mempool.space/signet/api/block-height/$H")
  curl -fsS "https://mempool.space/signet/api/block/$HASH/header"
  curl -fsS "https://mempool.space/signet/api/block/$HASH"
done

for H in 311445 311446 311447 311448 311449; do
  HASH=$(curl -fsS "https://blockstream.info/signet/api/block-height/$H")
  curl -fsS "https://blockstream.info/signet/api/block/$HASH/header"
done
```

Cross-checked headers:

| Height | Hash |
| --- | --- |
| `311445` | `00000003039bc6bf57032bcc38bbba04126f8e0dee75f5ace50e099753b51953` |
| `311446` | `000000146732f5827927732a5012dafc6a29e023b6434d1e25aa8edc2d0d7355` |
| `311447` | `00000010c4a75484c4ff84963b9c82d7a1e4ef7f7a5df14bf26c6224bc6ae540` |
| `311448` | `0000000a5504de64bfb8433fe8d288c2cccf0ee615a3a6027d52bad344babbc1` |
| `311449` | `000000070aa730f1c5a3aa97c40b8f6cbf8053158d1f8507d164662adf5f4004` |

`cumulativeWorkHex` was derived from the signet headers by summing Bitcoin Core block proof per epoch:

```js
function bitsToTarget(bits) {
  const exponent = bits >>> 24;
  const mantissa = bits & 0x007fffff;
  return exponent <= 3
    ? BigInt(mantissa) >> BigInt(8 * (3 - exponent))
    : BigInt(mantissa) << BigInt(8 * (exponent - 3));
}

function blockProofFromBits(bits) {
  const target = bitsToTarget(bits >>> 0);
  return ((1n << 256n) - 1n - target) / (target + 1n) + 1n;
}
```

For each 2016-block epoch start from height `0` through `310464`, fetch the epoch-start block, compute
`blockProofFromBits(bits)`, multiply by the number of blocks in that epoch through height `311445`, and sum.
The final partial epoch contributes `982` blocks at `0x1d1539c3`; that epoch's per-block proof is `c0f9675`.

Result: `eafb567b00e`.
