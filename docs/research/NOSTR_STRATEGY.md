# ONT Nostr Strategy: The "Off-Chain Mirror"

ONT is a "Bitcoin-Minimalist" protocol. To remain minimal on the L1, it requires a robust, decentralized, and censorship-resistant layer for **metadata, discovery, and commerce**.

**Nostr (Notes and Other Stuff Transmitted by Relays)** is the "Gravity-Aligned" choice for this layer.

---

## 1. Decentralized Name Resolution (NIP-05 Replacement)
Instead of an ONT-run "Resolution CDN," the protocol can use Nostr relays as the source of truth for name "Values."
- **The Concept:** An ONT name owner publishes their `SignedValueRecord` (containing Lightning addresses, Bitcoin payment targets, or IPFS links) as a **Nostr Event**.
- **The Protocol:** Wallets and resolvers query Nostr relays for the latest record signed by the `ONT Owner Pubkey` associated with a name.
- **The Benefit:** No central "ONT Server" is required to host records. Infinite scalability through the global network of relays.

## 2. The Non-Custodial Marketplace (P2P Listings)
Instead of an ONT-run "Marketplace Database," name owners can list their names for sale on Nostr.
- **The Concept:** A seller broadcasts a **Nostr Event (e.g., Kind 30009)** containing:
    1. The name and its current Bond UTXO status.
    2. The ask price in ₿ terms.
    3. A **PSBT Skeleton** (the seller's signed input to move the bond).
- **The Workflow:** A buyer sees the listing, adds their payment inputs to the PSBT, signs it, and broadcasts the final transaction to the Bitcoin network.
- **The Benefit:** **Zero-Server Commerce.** The trade is peer-to-peer and atomic. No "Marketplace Fee" is required unless hardcoded into the PSBT.

## 3. P2P Bond Liquidity (Bond-as-a-Service)
Nostr can act as the "Bidding Floor" for name-bond liquidity.
- **The Concept:** A user who wants a high-value name but lacks the 1 BTC bond can post a **"Request for Bond"** event on Nostr.
- **The Workflow:** Liquidity providers respond with **Offers**, including a signed PSBT that provides the bond. The user selects the best "Interest Rate" and completes the auction-backed acquisition.
- **The Benefit:** Turns "Bond-as-a-Service" into a decentralized financial market, removing regulatory and custodial risk for ONT developers.

## 4. Real-Time "Guardian" Notifications
Using Nostr's native event-push architecture for bond safety.
- **The Concept:** A "Guardian Bot" monitors the Bitcoin blockchain for ONT bond continuity.
- **The Workflow:** If a bond is spent (or is in danger of being spent), the bot sends an **Encrypted Direct Message (NIP-04)** to the owner's `npub`.
- **The Benefit:** No emails or phone numbers required. Sovereignty and privacy are preserved while ensuring bond safety.

---

## Technical Integration Roadmap
1. **Nostr Kind Specification:** Propose a dedicated Nostr Event Kind for ONT `SignedValueRecords` and `Marketplace Listings`.
2. **CLI Integration:** Add `ont publish-to-nostr` and `ont find-on-nostr` commands.
3. **Web Client:** The ONT prototype website becomes a **Nostr Client** that filters and displays these events, acting as the "User Interface" for the decentralized data.
