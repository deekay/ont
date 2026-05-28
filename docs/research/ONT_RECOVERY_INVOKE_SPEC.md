# Recovery invoke — what's needed beyond what we already have

The wallet can *arm* a recovery descriptor today (`arm-recovery`); it cannot yet
*invoke* recovery on-chain. This is the spec for what's still missing, written
after digging through the protocol code to see what already exists.

## What exists today

In `@ont/protocol`:

- `signRecoveryDescriptor` — owner-key Schnorr signature over a
  `SignedRecoveryDescriptor` (the arming step). Wallet has this wired.
- `RecoverOwnerEventPayload` — the on-chain OP_RETURN body for a recovery
  invocation. Includes `prevStateTxid`, `newOwnerPubkey`, `flags` (with
  `RECOVER_OWNER_FLAG_CANCEL`), `successorBondVout`, `challengeWindowBlocks`,
  `recoveryDescriptorHash`, and a 64-byte Schnorr `signature`.
- `signRecoverOwnerCancelAuthorization` / `verifyRecoverOwnerCancelAuthorization`
  — for the **veto path** during the challenge window. The owner key signs a
  cancellation authorization.
- `RecoveryWalletProof` (separate file) — BIP322 signature proving the
  recovery wallet controls the recovery address. Posted off-chain to the
  resolver via `/recovery-proofs`, not embedded in the on-chain payload.

In the resolver: routes for `POST /recovery-descriptors` and
`POST /recovery-proofs` already exist; the indexer recognizes the
`RECOVER_OWNER` event type and tracks `pendingRecovery` state.

## What's missing in code

1. **`buildRecoverOwnerArtifacts` in `@ont/architect`.** The PSBT builder for
   the on-chain RECOVER_OWNER tx — analogous to `buildAuctionBidArtifacts`
   and `buildTransferArtifacts`. It needs:
   - the previous state's bond input (the current name bond UTXO)
   - the recovery descriptor (or its hash) — so the OP_RETURN can reference
     it via `recoveryDescriptorHash`
   - the new owner pubkey the recovery wallet is rotating to
   - the successor bond output (locked at the recovery address)
   - the funding inputs to cover the fee
   - the 64-byte signature that satisfies the consensus check on the OP_RETURN

2. **Clarity on who signs the on-chain `signature` field.** The 64-byte
   Schnorr signature in `RecoverOwnerEventPayload` could be:
   - (a) the owner-key signature **embedded in the armed descriptor** (the
     existing arming signature replayed on-chain as proof the descriptor
     was authorized), or
   - (b) a fresh signature by the **recovery wallet** over the
     `RecoverOwnerAuthorizationFields` digest (different signing profile —
     would need a Schnorr-capable recovery key, or a BIP322 path), or
   - (c) the owner-key cancel signature, in the veto path only.

   The cancel-authorization function exists and is clearly the veto-path
   signer. The invoke-path signer isn't yet defined. **This is the open
   protocol question.** Once decided, the architect builder can take the
   matching input shape (the descriptor for path (a), or a recovery-wallet
   signing key/PSBT signer for path (b)).

3. **`buildRecoverOwnerCancelArtifacts`** — the veto-path builder. Simpler:
   the owner key signs the cancellation, the funding key signs the inputs.
   The architect just needs the owner private key + the pending recovery's
   descriptor hash + the bond input. This is a small slice and could land
   ahead of invoke.

## Suggested wallet surface, once the architect builders exist

```
recover-invoke <name> --recovery-wif <wif> --to <new-owner-pubkey> [--resolver <u>]
    Spend the current name bond into the recovery address, committing the
    armed descriptor's hash. Requires the recovery wallet's key.

recover-cancel <name> [--resolver <u>]
    Cancel a pending recovery during the challenge window. Owner-key signed.
```

The CLI flow would:
1. Pull the current `SignedRecoveryDescriptor` from the resolver
   (`getRecoveryDescriptor` exists).
2. Pull the name record (current bond outpoint + state txid).
3. Build the artifacts via the new architect function.
4. Sign with the appropriate key (recovery WIF for invoke, owner key for
   cancel).
5. Broadcast (opt-in, same as claim/transfer).

`sync` should already pick up the `pendingRecovery` state from the resolver
(the indexer tracks it) — the wallet just needs to surface it.

## What this means for the meeting / signet testing

- **Armed recovery already works.** A user can arm a descriptor today and a
  resolver enforces the chain-of-descriptors. That's enough to demonstrate
  the *design* of recovery without the on-chain invocation.
- **Live invocation needs the protocol decision in §2** before code lands.
  Worth raising with Max (or anyone fluent in the recovery design) since the
  signature-identity question affects whether recovery wallets need
  Schnorr-capable keys or whether a BIP322 indirection through the
  off-chain proof is enough.

Once that's decided, recovery invoke + cancel are a focused PR: one
architect builder per direction, two wallet commands, integration tests.
