# ONT — path to a fully functional app

A dependency-ordered plan to take the iOS app from "read + verify + value-record
write" to a real, self-custodial, claim-and-bid client — built on the decisions
made with David (2026-05-29), modeled on Lexe where Lexe has already solved the
same scale/neutrality problem.

Nothing here is committed. This is the plan to approve before more code.

---

## Update — 2026-06-05 (Max Fang / Lexe call): on-chain layer → Rust BDK

This supersedes the on-chain *implementation* choice below (it does **not** change the
signer/non-custodial model or the Lexe-as-provider stance):

- **On-chain tx construction moves from `bitcoinjs-lib` (TS) to Rust BDK, bridged into React
  Native** (`bdk-rn` / `bdk-ffi` UniFFI). This is the substrate for the real on-chain PSBT bid
  (A1/#60), bonds, transfers, recovery, and any direct-L1 claim. A **BDK↔RN bridge spike is the
  first build task** — model the structure on established BDK/Rust repos (Lexe, the bitcoindevkit
  org) rather than inventing it.
- **The verification engine `@ont/consensus` stays TypeScript** — BDK *builds* txs, the engine
  *verifies* them. Hard requirement: Rust-built txs must be **byte-identical** to what
  `@ont/consensus` validates on read-back (same cross-language conformance as `check:crypto`).
- **Lexe stays the switchable LN *provider*** (publisher receiver side); the app shows the BOLT11
  and the user pays from their own Lightning wallet — unchanged.
- **Funding is gated to auction/contest only:** bare-claims pay any LN invoice with **no deposit**
  (web or app); you fund the wallet only to bid/contest (on-chain). Refines "Deposit" (A3) into
  progressive disclosure.
- **Cost:** ₿1,000 gate (to miners) + a *thin* publisher service fee; no PTLCs in v1 (trust the
  publisher with ~$1; recourse is on-chain contestation). Mainnet still deferred.

Full call notes: `~/.sprout/RESEARCH/ONT_WALLET_AND_PUBLISHER_ARCHITECTURE_2026_06_05.md`.

---

## Where we are today

| Capability | State |
| --- | --- |
| Explore / Auctions / Activity (read) | live |
| Wallet: on-device keys + Keychain storage | live |
| Name accumulator verify | verified vs engine |
| Value-record signing + **write** | live, proven on the private signet |
| Cheap-rail (non-auction) claim | coded, **inert** (no reachable publisher, no payment rail) |
| Deposit / hold funds | none (fund the address externally) |
| Auction bidding | not built (#60) |
| Backup / recovery | none beyond manual key reveal |

The app is a **signer + viewer**. Everything that moves money or writes to chain
is either gated on a decision or unbuilt.

---

## Locked decisions (this session)

1. **The app is a pure, non-custodial signer.** It manages exactly two keys
   (owner = controls the name; funding = pays on-chain fees/bonds) and **never
   holds a hot Lightning balance.** Forced anyway — there is no Lexe mobile SDK —
   and correct: we don't run or custody Lightning for users.
2. **Lightning via Lexe, on the publisher (receiver) side.** The publisher runs
   its own Lexe node + sidecar to mint the gate invoice and verify payment
   (`LexeSidecarInvoiceProvider` / `LexeSidecarPaymentVerifier`, already coded,
   switched on by `ONT_PUBLISHER_LEXE_SIDECAR_URL`). The **app just displays the
   BOLT11 invoice; the user pays from their own Lightning wallet** (Lexe
   recommended).
3. **Backup/recovery = optional, Lexe-style.** Optional account sign-in used
   *only* to store a **client-side-encrypted** wallet blob in the user's own
   **Google Drive *and* iCloud**. Never required to claim, own, or use a name.
   The app/service never sees plaintext keys or the decryption key.
4. **Recovery descriptors stay the protocol-native name-recovery path** (already
   validated), layered above key-blob backup.
5. **Notice window stays 6 blocks. Bitcoin-first `₿` display, never "sats" in UI.**

---

## Network & test strategy (signet vs mainnet)

The payment layer is an interface with two implementations, so the protocol and
the money are tested separately:

- **Private signet = protocol truth.** Full claim → anchor → 6-block notice →
  finalize, bonds, inclusion proofs — with the payment leg **stubbed**.
  Deterministic, reproducible bond-price cases, no real money. **Lexe is not
  involved on signet.**
- **Mainnet = money truth.** Swap the stub for the **Lexe sidecar**; the invoice
  becomes a real BOLT11 the user pays from their own Lexe wallet. Separate,
  later, tiny-sats smoke → launch.

> They never overlap: signet proves the protocol, mainnet+Lexe proves the money.

---

## Roadmap (dependency-ordered)

### Phase A — finish the app as a signer (no new infra, signet)
- **A1 · Auction bid.** ✅ *demo done* — walkable bid on AuctionDetail (real
  minimum + bidder commitment; bond/broadcast simulated). The real on-chain PSBT
  bid (#60) is still to build: bitcoinjs + funding key, broadcast via `/esplora`,
  track the bond UTXO; needs a funded test account + a live lot + a per-write OK.
- **A2 · Recovery-descriptor write.** ✅ *done* — `wallet/recovery-descriptor.ts`
  byte-exact vs engine + `recovery-write.ts` + `RecoveryScreen`. Live write is
  blocked only by the public proxy (it 405s `POST /recovery-descriptors`; the
  resolver supports it) — a shared-infra allowlist fix. Demo mode signs locally.
- **A3 · My ONT + Deposit.** ✅ *done* — owned names + leading auctions
  (`MyNamesScreen`), funding address + balance (`DepositScreen`).
- **A4 · Crypto regression suite.** ✅ *done* — `npm run check:crypto` proves the
  ported crypto matches the engine byte-for-byte.

### Phase B — backup & recovery (Lexe-style, optional)
- **B1 · Client-side encryption.** ✅ *done.* `wallet/backup.ts`: scrypt KDF +
  XChaCha20-Poly1305 AEAD; recovery code (+ optional passphrase). Swappable
  `BackupProvider`; `LocalStubBackupProvider` stands in for cloud today. Full
  backup/restore UI (`BackupScreen.tsx`). Verified round-trip + tamper rejection.
- **B2 · Google Drive backup + restore.** OAuth via `expo-auth-session`, Drive
  REST, scoped to the app-only folder (`drive.appdata`) so the app can't see the
  rest of the user's Drive. Mirrors Lexe. *(Implement the BackupProvider iface.)*
- **B3 · iCloud backup + restore.** CloudKit private DB (or the iOS key-value
  store) via a small native module / Expo config plugin. The native peer to B2.
- **B4 · Optional sign-in plumbing.** Surfaced only on the backup screen; the
  rest of the app works with no account at all.

### Phase C — activate the cheap rail (signet, stubbed payment)
- **C1 · Expose the publisher** behind Caddy with auth + rate-limit (the way
  `/api` and `/esplora` are exposed), not a tunnel.
- **C2 · Point the app** (`PUBLISHER_BASE`) at it and run the cheap-rail claim
  end-to-end on the private signet with the **stubbed** payment. Proves the full
  quote → verify → submit → inclusion-proof path in-app.

### Phase D — mainnet bring-up (the gating decision)
- **D1 · Decide mainnet** anchoring for the whole stack (resolver, publisher,
  esplora). This is bigger than the app and is what truly gates "fully functional
  for real."
- **D2 · Publisher's Lexe node on mainnet**; swap stub → Lexe sidecar.
- **D3 · App shows the real BOLT11**; user pays from their Lightning wallet.
- **D4 · Tiny-sats end-to-end smoke**, then launch.

### Phase E — polish
- Reproducible app build (Lexe-style verifiability), name discovery/search UX,
  notifications on contest/finalize, App Store / TestFlight distribution.

---

## Still-open decisions

- **Mainnet timing & anchoring (Phase D)** — the single biggest call; everything
  "for real" waits on it.
- **App distribution** — bundle id is `org.opennametags.mobile`; TestFlight →
  App Store path, signing identity, review considerations.
- **Whether to rehearse real Lightning pre-mainnet** — optional non-Lexe
  signet/mutinynet node. Recommendation: skip; the stub covers the protocol and
  Lexe covers the money.

---

## Notes / risks

- **No Lexe mobile SDK** — the app never embeds Lexe; the user pays externally.
  Confirmed against Lexe's published SDK set (CLI, Python, Rust, Sidecar).
- **iCloud + Drive both need a small native/OAuth surface** — not pure JS, but
  both are standard in an Expo app (config plugin for CloudKit; `expo-auth-session`
  + Drive REST for Google).
- **Each live write stays explicitly authorized**, per the value-record-write
  precedent — the app is built to be correct and ready, and switched on
  deliberately.
