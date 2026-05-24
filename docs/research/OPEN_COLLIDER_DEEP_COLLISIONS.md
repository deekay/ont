# Open Collider Phase 2: Deep Semantic Collisions for ONT Scaling

This document presents a second, deeper phase of the Open Collider research process. It addresses the core architectural gaps identified in the first pass of the ONT scaling model (flat namespace, no tokens, no blockchains, zero-consensus notice logs) by colliding them with four highly distant knowledge domains:

1. **Seismic Tomography (Geophysics)** $\rightarrow$ Target: Proving the *absence* of challenges (non-inclusion proofs) for light clients without downloading global history.
2. **Manuscript Stemmatology (Paleography)** $\rightarrow$ Target: Preventing the *double-spending of off-chain sponsor credits* without a consensus registry.
3. **Forest Mycorrhizal Networks (Mycology)** $\rightarrow$ Target: Mitigating *P2P gossip spam* in a zero-authority open log system.
4. **General Average (Admiralty / Maritime Law)** $\rightarrow$ Target: Distributing the *L1 escalation cost* to defend against mass-griefing attacks.

---

## 1. The Core Architecture Gaps (The Brief)

The first Open Collider pass concluded that a **Public Title-Notice System** is the most promising path to scale a flat namespace under ONT's constraints. However, it left four key technical questions unresolved:

*   **The Light-Client Non-Inclusion Dilemma**: To trust a sponsored name, a light client must verify that *no valid challenge occurred* during its off-chain notice window. How does it do this without downloading the entire epoch's log history or trusting a single resolver's database?
*   **The Credit Double-Spend Problem**: Sponsors issue off-chain claims backed by their locked L1 BTC-Time capacity (credits). Without a consensus blockchain, what prevents a malicious sponsor from signing two conflicting claims (double-spending their capacity) for different users?
*   **Zero-Authority Gossip Routing**: If notice logs are open and writable by anyone, how do independent relays route claims and ignore spam without a central whitelist, registration fee, or token?
*   **The Griefing Asymmetry**: A wealthy adversary could submit low-cost off-chain challenges to force every honest, cheap registration to escalate to a costly L1 Bitcoin auction. How does the protocol make mass-griefing expensive while keeping honest registration cheap?

---

## 2. Distant Domain Collisions & Protocol Mechanics

```
        +-------------------------------------------------------------+
        |                 DISTANT KNOWLEDGE DOMAINS                   |
        +--------------------+--------------------+-------------------+
                             |
                             v
+---------------------------------------------------------------------+
| Seismic Tomography (Geophysics)                                     |
| -> Principle: Cross-cutting ray-path intersections reveal structure. |
| -> ONT Mechanism: Tomographic Witness Intersection (TWI).           |
+---------------------------------------------------------------------+
                             |
                             v
+---------------------------------------------------------------------+
| Manuscript Stemmatology (Paleography)                               |
| -> Principle: Lineage defined by inherited errors and mutations.     |
| -> ONT Mechanism: Equivocation Lineage Mutation (ELM).              |
+---------------------------------------------------------------------+
                             |
                             v
+---------------------------------------------------------------------+
| Mycorrhizal Mycelium Networks (Biology)                             |
| -> Principle: Resource allocation and decay over distance/affinity. |
| -> ONT Mechanism: Fungal Gossip Propagation (FGP).                  |
+---------------------------------------------------------------------+
                             |
                             v
+---------------------------------------------------------------------+
| General Average (Maritime Law)                                      |
| -> Principle: Shared sacrifice and collective risk pooling.         |
| -> ONT Mechanism: Mutual General Average (MGA) Pools.               |
+---------------------------------------------------------------------+
```

---

### Collision 1: Seismic Tomography (Geophysics)

#### The Distant Domain Principle
In geophysics, scientists cannot peer directly into the Earth's core. Instead, they record seismic waves from earthquakes traveling through the planet's interior. A single seismograph station only records a one-dimensional wave arrival. However, by intersecting thousands of overlapping wave paths (rays) from different earthquake sources to different receivers, researchers build a three-dimensional model (a tomogram) of the Earth's internal structure. Velocity anomalies are mapped entirely by the consensus of intersecting lines.

#### ONT Mechanism: Tomographic Witness Intersection (TWI)
To prove that a name `alice` was *not* challenged during its challenge window, a light client does not need a single cryptographic proof of non-inclusion from a trusted tree. Instead, it constructs a **Tomographic Proof**.

1.  **Witness Anchors**: A set of independent, globally distributed notice relays (which mirror the log swarms) act as "seismic stations."
2.  **Sounding Path**: When a name is claimed, the claimant registers the notice across multiple distinct, unconnected log paths.
3.  **Witness Intersection**: To verify the name's vacant state, the client sends challenge-lookup queries to a randomized subset of $K$ independent witness relays.
4.  **Vector Validation**: Each witness relay returns a signed attestation:
    $$\text{Attestation} = \text{Sign}_{\text{Relay}}(\text{Hash}(\text{Epoch } E), \text{Name } N, \text{Status: Vacant})$$
    If any witness has seen a challenge for `alice` during the window, it returns the signed challenge.
5.  **Tomographic Density**: The verifier accepts the proof of non-challenge if and only if the intersecting paths of $K$ uncolluding witnesses confirm vacancy. If one witness is silent or missing data, the "tomographic path" is broken, and the name's assurance is degraded.

```
       [Client/Verifier]
        /      |      \
       /       |       \  (Overlapping query paths)
      v        v        v
  [Relay A] [Relay B] [Relay C]
    | Status:  | Status:  | Status:
    | Vacant   | Vacant   | Vacant
    \          |          /
     \         |         /
      v        v        v
  [Tomographic Intersection: HIGH ASSURANCE]
```

*   **Why it solves the gap**: It shifts the burden of proof from downloading *all* data to demonstrating that a query path intersected *no* negative assertions across a diverse, decentralized witness set. An attacker who wants to censor a challenge must compromise the entire intersection set, rather than a single database.

---

### Collision 2: Manuscript Stemmatology (Paleography)

#### The Distant Domain Principle
Before the printing press, manuscripts were copied by hand. Scribes inevitably made copying errors. Textual critics (paleographers) reconstruct the lost original text (the archetype) not by counting votes, but by mapping a family tree (stemma) of the manuscripts based on shared errors. If Scribe B makes a unique spelling mistake, and Scribes C and D copy from B, they will inherit that exact mistake. The shared mutation proves their lineage. If a branch introduces a contradiction, its entire descent is cast out.

#### ONT Mechanism: Equivocation Lineage Mutation (ELM)
Sponsor credits are issued off-chain based on locked L1 BTC-Time capacity. To prevent a sponsor from double-signing (equivocating) their credit allocation, we treat the sponsor's signed output history as a genetic lineage of records.

1.  **Lineage Chains**: Every off-chain claim signed by a sponsor contains a back-reference (hash and height index) to the sponsor's previous signed claim:
    $$\text{Claim}_t = \{ N_t, \text{Owner}_t, \text{SponsorSig}(\text{Claim}_{t-1}, H_t) \}$$
    where $H_t$ is a monotonic height counter of the sponsor's allocations.
2.  **The Mutation Flag**: If a sponsor signs two different claims at the same height $H_x$ (double-spending their capacity), this event is a **Lineage Mutation**.
3.  **Client-Side Infection (ELM Rule)**: When client indexers scan the notice logs and detect two signed records from the same sponsor sharing the same height index:
    *   The sponsor's key is marked as **Mutated/Infected**.
    *   *Sovereign Slaying*: Every name claim derived from that sponsor *after* the mutation point is immediately and automatically invalidated by client-side parser rules.
    *   The mutation is "highly contagious." Any attempt to build upon a mutated lineage fails validation.
4.  **L1 Recovery**: The only way for an honest user caught in a mutated sponsor lineage to save their name is to escalate to a direct L1 auction, bypass the sponsor, and anchor their title directly.

```
Sponsor Lineage:
H: 1 [Claim A] -> H: 2 [Claim B] -> H: 3 [Claim C] (Healthy Lineage)
                                  -> H: 3 [Claim D] (EQUIVOCATION / MUTATION)
                                        |
                                        v
                            [ALL SUBSEQUENT CLAIMS INVALIDATED]
```

*   **Why it solves the gap**: We don't need a live consensus blockchain to prevent double-spending. If a sponsor double-spends, they permanently self-destruct their entire off-chain issuance business. The risk of total lineage collapse forces sponsors to maintain strict, linear public state logs, while protecting users through the direct L1 fallback.

---

### Collision 3: Forest Mycorrhizal Networks (Biology)

#### The Distant Domain Principle
In forest ecosystems, trees are connected underground by mycorrhizal networks—intricate webs of fungal hyphae. This network does not have a central coordinator, yet it dynamically allocates nutrients (like carbon, nitrogen, and phosphorus) and propagates warning signals. When a tree is attacked by pests, it releases chemical warning signals into the mycelial network. The network propagates these signals only if they cross specific concentration and affinity thresholds. The signal decays over distance to prevent noise, ensuring only local, relevant warnings trigger costly tree defense responses.

#### ONT Mechanism: Fungal Gossip Propagation (FGP)
To prevent notice logs from being overwhelmed by spam claims and fake challenges, we structure the peer-to-peer gossip network of relays as a Mycorrhizal Network using decay-based propagation.

1.  **Affinity Signals**: Every claim or challenge gossiped to a relay must carry a small "nutrient packet":
    *   An off-chain proof of resource: either a small Hashcash PoW (computation) or a Lightning routing signature (micro-satoshis).
2.  **Hyphal Routing**: Relays (fungal nodes) check the affinity value of the incoming notice.
3.  **Distance Decay**: As a notice is forwarded from relay to relay, its propagation range is governed by the size of its nutrient packet:
    $$\text{Hop Limit} = f(\text{Affinity Value})$$
    A low-cost claim (low PoW) only propagates 1 or 2 hops (local availability). A high-cost claim (high PoW or locked BTC-Time) is routed globally across the entire network.
4.  **Local Absorption**: Relays store local, low-affinity claims only for their immediate neighborhood. If a client wants global notice for their name, they must supply a larger affinity packet to ensure wide propagation, or rely on a sponsor's globally recognized capacity.

```
[Local Client] -> (Low PoW) -> [Relay 1] -> (Decayed) -> [Relay 2 (Stops Propagation)]
[Global Client] -> (High PoW) -> [Relay 1] -> (Gossips) -> [Relay 2] -> [Relay 3 (Global)]
```

*   **Why it solves the gap**: It avoids global whitelists or consensus-level spam rules. Relays use simple, local physical boundaries (storage-cost vs. affinity-value) to filter incoming noise. A spammer can flood their local relay, but the spam will decay quickly and fail to propagate globally, keeping the rest of the network clean.

---

### Collision 4: General Average (Maritime Law)

#### The Distant Domain Principle
Dating back to the ancient Phoenicians, "General Average" is a foundational principle of maritime law. If a vessel is in danger of sinking, the captain may order cargo to be jettisoned to lighten the ship. Under General Average, the financial loss of the jettisoned cargo is not borne solely by its owner; instead, it is shared proportionally by all stakeholders (the shipowner and all cargo owners) whose property was saved by the sacrifice. This aligns incentives perfectly: cargo owners do not fight the captain's decision to throw cargo overboard, because their remaining cargo is protected, and the risk of loss is pooled.

#### ONT Mechanism: Mutual General Average (MGA) Pools
If an adversary tries to grief the network by submitting false off-chain challenges to force honest claimants into expensive L1 auctions, the protocol mitigates this through a mutual risk-sharing pool.

1.  **The Sacrifice**: When a contested name escalates to an L1 auction, the honest claimant is forced to pay L1 transaction fees and post a BTC auction bond. This is the "jettisoned cargo" (the sacrifice).
2.  **The MGA Pool**: Users, sponsors, and resolvers contribute tiny fractional micro-payments (satoshis) into a decentralized, local General Average Pool when registering names off-chain.
3.  **Mutual Defense Funding**: If a name in the pool is attacked by a malicious challenge:
    *   The pool automatically funds the L1 auction defense and transaction fees.
    *   If the honest claimant wins the auction on L1, the attacker's L1 Challenge Bond is slashed.
    *   The slashed BTC is returned to the MGA Pool to replenish its capital.
4.  **Asymmetric Penalty**:
    *   *The Attacker*: Must spend a full L1 Challenge Bond *for every name* they contest.
    *   *The Community*: Pays a tiny, pooled insurance premium. If the attacker is wrong, they lose their bond to the pool. If the attacker is right (e.g., they found an actual conflict), the name is justly resolved on L1.

```
       [Sponsor/User Fees] ---> [ MGA Defense Pool ]
                                       |
                                       | (Funds L1 fees for defense)
                                       v
[Malicious Challenger] --(Loss)--> [ L1 Auction ]
   (Forfeits Bond)                     |
          |                            v
          +---(Slashed Bond Returns)---+
```

*   **Why it solves the gap**: It flips the economic asymmetry. An attacker trying to grief thousands of registrations faces a linear, compounding cost ($N \times \text{L1 Bond}$). The community defends against the attack using a sub-linear, pooled cost funded by the attacker's own slashed capital.

---

## 3. Updated Candidate Evaluation Matrix

We evaluate these four new mechanisms alongside the previous architectures. Scores are `1-5` (5 being the strongest).

| Mechanism / Candidate | Sovereignty | Flatness | Bitcoin-only | Scale | DA Assurance | Grief Resistance | Implementation Complexity |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **A. Direct L1 Bonded Auction** | 5 | 5 | 5 | 1 | 5 | 3 | 5 (Simplest) |
| **B. Tomographic Witness Intersection (TWI)** | 4 | 5 | 5 | 5 | 4 | 4 | 3 |
| **C. Equivocation Lineage Mutation (ELM)** | 4 | 5 | 5 | 5 | 3 | 4 | 3 |
| **D. Fungal Gossip Propagation (FGP)** | 3 | 5 | 5 | 5 | 3 | 4 | 4 |
| **E. Mutual General Average (MGA) Pools** | 4 | 5 | 5 | 4 | 4 | 5 | 2 |

---

## 4. Retroactive Compatibility: Preparing v1 for Off-Chain Scaling

To ensure that the initial, simple L1 implementation (v1 direct auctions) does not block these advanced off-chain scaling paths, the v1 protocol must design its core state schemas and transaction structures with retroactive compatibility.

### 1. Unified Proof-Bundle Grammar
The v1 client validation parser should expect all name ownership claims to be presented in a standardized **Proof Bundle** format.
*   For v1: The bundle simply contains the L1 transaction proof and UTXO path.
*   For off-chain scaling: The bundle contains the claim receipt, the epoch anchor, and the TWI/ELM proof.
*   *Action*: Define a polymorphic validation schema in [packages/protocol](file:///Users/davidking/dev/ont/packages/protocol) where the verification engine routes to different validation rules based on an `AcquisitionSource` tag.

### 2. The `SponsorCommitment` Field in L1 Transactions
When locking Bitcoin on L1 to create sponsor capacity, the L1 transaction must commit to a public key designated as the **Sponsor Authority**.
*   This authority key is the one used to sign off-chain claims and is subject to the **ELM Mutation Rules**.
*   *Action*: Reserve a script pathway in the L1 auction UTXO spend paths that allows a sponsor key to be flagged or invalidated on-chain if a mutation proof is submitted directly to L1.

### 3. Escalation Hook
Every L1 direct auction transaction should include an optional metadata field pointing to the off-chain **Conflict Notice ID** that triggered it.
*   This links on-chain auctions back to the off-chain notice logs, allowing indexers to easily reconcile why a pending off-chain name was suspended and how it resolved on L1.

---

## 5. Proposed Research Roadmap

To validate these semantic collisions, the project should execute the following concrete prototypes:

1.  **Prototype TWI (Tomographic Witness Intersection)**:
    *   Write a script in the [apps/indexer](file:///Users/davidking/dev/ont/apps/indexer) that queries 5 mock relays for a name's state and determines vacancy based on overlapping signed status reports.
2.  **Prototype ELM (Lineage Mutation)**:
    *   Create a test fixture in [packages/core](file:///Users/davidking/dev/ont/packages/core) where a sponsor key signs a double-spend at height 3. Validate that the client parser successfully marks the sponsor as mutated and rejects all subsequent claims in the lineage.
3.  **Simulate MGA (General Average) Economics**:
    *   Write a basic simulator in the `scripts/` directory modeling the cost of an attacker submitting 1,000 false challenges vs. the pool's capacity to defend and absorb the slashed bonds.
