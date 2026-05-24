# Scaling Flat Namespaces via Open Public Notice Logs (No Blockchains/Tokens)

## Abstract
This document details a conceptual architecture for scaling Open Name Tags (ONT) to global volume while:
1. Maintaining a **flat (non-hierarchical) namespace** (no mandatory subdomains to bypass scale issues).
2. Introducing **no new tokens or blockchains** (relying strictly on Bitcoin as the sole scarce asset and cryptographic clock).
3. Using **public append-only logs** that are **writable by anyone** without sliding into the "accidental blockchain" trap.

---

## 1. The "Accidental Blockchain" Trap
In scaling systems, append-only logs are often introduced to batch data and reduce direct L1 transactions. However, if a designated set of operators (relays, validators, or coordinators) is given the authority to decide the order of entries in the log and filter which entries are valid, the log layer functions as a permissioned blockchain.

Without a native gas token or block rewards to align incentives, such a permissioned log layer inevitably suffers from:
* **Censorship & Centralization**: The gatekeepers control who gets names.
* **Lack of Sybil Resistance**: Without PoW/PoS or block rewards, validating membership is subjective, leading to federated trust bottlenecks.
* **Incentive Misalignment**: Gatekeepers have write authority over the state but no economic rewards to secure it honestly.

### The ONT Scaling Rule
> The notice log must have **zero consensus authority**. The log does not decide state or validate transaction correctness. It is purely a public broadcast and archiving medium. Consensus is determined strictly off-chain by client-side indexers replaying deterministic merge rules over all publicly available data, with conflict resolution escalating to Bitcoin L1.

---

## 2. Open Notice Logs: Writable by Anyone
To avoid permissioned write authority, any notice log must be open for anyone to write to, read from, or run. 

### The Publication Medium
A "Notice Log" is not a single database. It is a peer-to-peer gossip network and publication substrate. It can be implemented using:
* **Nostr Relays**: Anyone can publish signed claim/challenge events to open Nostr relays.
* **Content-Addressed Archive Swarms (BitTorrent/IPFS)**: Claims are packed into Content-Addressed Archives (CAR files) and seeded by claimants, resolvers, and mirrors.
* **HTTP Log Relays**: Independent nodes run simple HTTP endpoints where clients POST signed records. The nodes publish a hash-linked chain of entries.

### Anti-Spam & Sybil Resistance (No Tokens)
If anyone can write to the log, a malicious actor could flood the log with claims for millions of names, or submit fake challenges to block honest registrations. Without a native token or gas fees, spam is mitigated through two separate layers:

```
+-----------------------------------------------------------------------+
| 1. Local Service Fee Layer (bandwidth/storage)                        |
|    - Lightning micro-payments (satoshis) paid to individual relays   |
|    - Local Hashcash proof-of-work (anti-spam CPU cost)                |
+-----------------------------------------------------------------------+
| 2. Protocol Consensus Scarcity Layer                                  |
|    - Claims require BTC-Time capacity (accrued from mature L1 bonds)   |
|    - Challenges require locking real BTC capital (L1 Challenge Bonds) |
+-----------------------------------------------------------------------+
```

1. **Local Relay Service Fees (Anti-Spam)**:
   * Individual notice relays can require a tiny payment in BTC (via Lightning network satoshis) or a local Hashcash proof-of-work (PoW) to accept, gossip, and store a notice.
   * *Non-Consensus Constraint*: This fee is a local transaction cost paid directly to the service provider for storage. It is not part of the consensus rules. If a relay charges too much or censors a client, the client can submit to another relay, run their own, or gossip the data directly to peer-to-peer mirrors.
2. **Sponsor BTC-Time Capacity**:
   * To prevent a single claimant from claiming all short, valuable names off-chain for free, the protocol rules require that a valid "Notice of Claim" must be signed by a sponsor key holding sufficient **BTC-Time Credits**.
   * These credits are accrued deterministically by locking BTC on L1 (via direct v1 auctions and mature bonds). Spammers are bounded by the real opportunity cost of locked Bitcoin capital.
3. **Bitcoin-Backed Challenge Bonds**:
   * A challenge cannot be a free signature. To file a valid challenge, the challenger must reference a live Bitcoin UTXO (an L1 Challenge Bond) that locks a minimum amount of BTC. 
   * If the challenge is frivolous or lost, this capital remains locked or is burned/slashed. This makes griefing (challenging every long-tail name to block registrations) prohibitively expensive.

---

## 3. Client-Side CRDT Epoch Replay
Since anyone can publish logs and there is no global ordering authority off-chain, network delay means different resolvers might observe claims in different orders. To prevent resolver divergence, finality is determined by grouping notices into coarse Bitcoin block height windows (epochs) and applying deterministic client-side merge rules.

```
       +---------------------------------------------+
       |   Claims & Challenges published in logs     |
       +---------------------------------------------+
                              |
                              v
       +---------------------------------------------+
       |   Indexers group notices by Bitcoin Epoch   |
       +---------------------------------------------+
                              |
            +-----------------+-----------------+
            |                                   |
            v                                   v
     [Single Claim]                    [Multiple Claims/Challenges]
  (No conflicts in epoch)                 (Conflict detected)
            |                                   |
            v                                   v
  +-------------------+               +-------------------+
  | Finalizes off-  |               | Suspended off-    |
  | chain after       |               | chain. Escalates  |
  | challenge window  |               | to L1 BTC Auction|
  +-------------------+               +-------------------+
```

### The Replay Algorithm
Indexers scan all publicly available logs and the Bitcoin blockchain, grouping events into epochs (e.g., $E_n$ = 144 blocks).

For a given flat name (e.g., `alice`):
1. **Uncontested Path**:
   * Exactly one valid claim is published in epoch $E_n$.
   * No valid challenge (backed by a Bitcoin L1 transaction) is published during the challenge window of $W$ epochs (e.g., 1008 blocks / 7 epochs).
   * **Result**: The claim is finalized. The name `alice` is owned by the claimant's owner key.
2. **Disputed/Conflict Path**:
   * Multiple conflicting claims are published in the same epoch $E_n$.
   * OR, a valid challenge (backed by an L1 Challenge Bond) is published before the challenge window closes.
   * **Result**: The off-chain registration is suspended. Deterministic rules reject all off-chain claims for `alice` in that epoch.
3. **Escalation to L1 Bitcoin**:
   * Once a name is suspended due to conflict, it **cannot be resolved off-chain**. The name can only be acquired by escalating to the standard **direct L1 Bitcoin auction**.
   * The disputing parties must bid real BTC on L1. Bitcoin's consensus acts as the final, censorship-resistant arbiter of conflict.

### Why this Aligns Incentives
* **Long-Tail Efficiency**: Boring, uncontested names (which form $99\%+$ of all registrations) finalize off-chain for near-zero cost.
* **Security via Fallback**: High-value names or contested names naturally escalate to the strongest assurance tier (direct L1 Bitcoin auctions).
* **Self-Limiting Griefing**: An attacker cannot block an honest user's off-chain claim without locking real BTC capital on L1. The attacker must spend scarce capital to dispute a claim, whereas the honest claimant only loses their pending time and can choose to either bid in the L1 auction or pick a different name.

---

## 4. Data Availability & Non-Inclusion Proofs
A major risk of off-chain logs is **data withholding**. A resolver could publish a state root claiming a name was uncontested, while withholding the fact that a challenge was submitted.

### Retrievable Content-Addressed Archives
Notice logs must be structured as content-addressed archive swarms:
1. Log entries are batched and formatted as **Content-Addressed Archives (CAR files)**.
2. Relays and resolvers mirror these CAR files via BitTorrent, IPFS, or public HTTP swarms.
3. Verifiers reject any checkpoint/state root unless the full underlying log data is available and validated. If data is withheld, the state is marked as **degraded/non-final**, and client wallets will warn the user.

### Proof of Non-Inclusion
For a claimant to prove they own a finalized sponsored name, they do not ask a central server. They carry a portable **Proof Bundle** containing:
* The original claim payload and its log receipt.
* The Merkle path showing inclusion in an anchored log epoch.
* **Challenge Non-Inclusion Proofs**: A cryptographic proof (e.g., from a Sparse Merkle Tree of the log's challenge index) demonstrating that no valid challenge for the name's hash was registered during the challenge window.
* **Cross-Witness Signatures**: Optional attestations from independent monitors confirming they have mirrored the logs for the challenge window and detected no conflicting claims or data withholding.

## 5. Handling Omission, Collusion, and Simultaneous Writes

To understand how a system writable by anyone functions under adversarial conditions, consider this scenario:

> **Scenario**: Three parties submit claims/writes for the same name `bob` at the same time.
> * **Party A** publishes their claim to Log 1.
> * **Party B** and **Party C** publish their claims to Log 2.
> * Party B and Party C run Log 2 and collude to intentionally omit/ignore Party A’s claim in Log 1, hoping to finalize the name `bob` for themselves.

Under traditional permissioned log models (where Log 2 is the "official" registrar or consensus server), Party B and Party C would succeed because they control the write authority of the official log.

Under ONT's permissionless, zero-authority notice model, this attack is defeated by design:

### 1. Indexer Aggregation (No Single "Official" Log)
An ONT client/indexer does not query just one log. It queries a broad set of peer-to-peer gossiped notice logs (Log 1 and Log 2) and replays them.
* As long as Party A's claim in Log 1 is published, gossiped, and archived (e.g. content-addressed and mirrored), any honest indexer will detect it.
* When the indexer replays the epoch, it aggregates all claims for the name `bob` across **all** reachable logs.
* Since the indexer sees claims from Party A (Log 1) and Parties B/C (Log 2) in the same epoch, it flags `bob` as **contested**.
* Off-chain finality is automatically blocked. The name `bob` is suspended, and it can now only be acquired by escalating to a **direct L1 Bitcoin auction**.
* Party B and Party C cannot "win" by omission; their attempt to ignore Party A simply forces them into an L1 auction where they must spend real BTC to compete with Party A.

### 2. Forcing a Write: Direct L1 Fallback
What if Log 1 and Log 2 collude and refuse to publish Party A's claim at all (100% off-chain censorship)?
* Party A can bypass the off-chain notice logs completely and write their claim directly to the **Bitcoin L1 blockchain** (by opening a direct L1 auction or posting a transaction with an `OP_RETURN` anchor).
* Bitcoin is the absolute censorship-resistant arbiter. Once Party A's transaction is confirmed on L1:
  * It acts as an overriding sovereign notice that cannot be ignored by off-chain indexers.
  * Any pending or finalized off-chain claims for `bob` that started in the same or later epochs are overridden or suspended.
  * The name escalates to an on-chain auction on Bitcoin.

### 3. Detecting "Dark" Logs (The Publication Adequacy Rule)
To prevent Party A from publishing their notice to a "dark log" in their basement (so B and C have no way of knowing they need to challenge it), a notice log is only recognized by indexers if:
* It is registered in the public gossip network.
* Its batches are regularly checkpointed with public data availability (CAR files).
* If Party A's claim is published on a truly secret/private log that B and C have no way of discovering, it fails the **public notice** requirement and is invalid.
* If Log 1 is public, archived, and gossiped, then Party B and Party C's indexers *must* check it. If they choose to modify their indexer software to ignore Log 1, they are split-forking themselves from the main ONT network, and their wallets will show different ownership than the rest of the world.

---

## 6. Summary of Protocol Invariants
* **Bitcoin is the Only Chain**: The notice log layer is a dumb data pipe. It has no validators, no blocks, and no consensus state. All state resolution is performed by clients running local, deterministic indexer code.
* **Flat Names Only**: Scale is achieved by separating "public notice of a claim" (cheap off-chain) from "conflict resolution/hardening" (expensive L1 Bitcoin-backed), preserving a flat namespace without subdomain delegation.
* **No Gatekeepers**: Because the logs are writable by anyone and resolvers simply replay available data, no single coordinator or relay can act as a registrar. Censorship is bypassed by publishing to alternative relays or direct self-archiving.

