# ONT — path to a fully functional app

A dependency-ordered plan to take the iOS app from "read + verify + value-record
write" to a real, self-custodial, claim-and-bid client — built on the decisions
made with David (2026-05-29), modeled on Lexe where Lexe has already solved the
same scale/neutrality problem.

Nothing here is committed. This is the plan to approve before more code.

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
- **A1 · Auction bid (#60).** Build/sign the bonded second-price L1 bid PSBT
  (bitcoinjs + funding key), broadcast via `/esplora`, track the bond UTXO. The
  RN bitcoinjs/Schnorr stack is proven; needs a funded test account + a live
  auction lot. *Live on-chain write — your go-ahead per write, like the value
  record.*
- **A2 · Recovery-descriptor write.** Mirror the value-record write path to
  `/recovery-descriptors` (same client shape, already proven for value records).

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
