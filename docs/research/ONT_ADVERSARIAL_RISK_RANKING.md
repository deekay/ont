# ONT Adversarial Risk Current Assessment

Context: a whole-system adversarial assessment — wealthy-actor capture, griefing of small users, the simple name path, auction dynamics and closure gaming, and the extra problems of a system with only dozens-to-hundreds of early users.

## Ranked Risks

### 1. Launch Capture / Legitimacy Failure

The biggest risk is not a cryptographic break. It is a legitimacy break: one well-capitalized actor claims a large share of the valuable namespace while the real market is not yet watching.

Attack shape:

- Claim tens or hundreds of thousands of attractive names during the first days.
- Pay only the per-name gate for names that nobody contests.
- Rely on brands, public figures, and ordinary users not knowing ONT exists or not being ready to contest with self-custodied bitcoin.

Why it matters:

- The protocol may say "they had notice," but if broad consensus arrives later and sees early capture as unfair, ONT can lose legitimacy.
- This is amplified because ONT deliberately avoids trusted reserved lists, identity-based caps, and subjective premium classifications.

Mitigations:

- Long, frozen, pre-announced launch contest window.
- Height-keyed decay only; no market-derived readiness signal that a whale can spoof.
- Real-time public feed of recent claims, provisional status, and open contests.
- Watcher/alert tools before mainnet.
- Consider a high launch gate or decaying launch gate for all names, or at least objective scarce classes.
- Consider whether the most scarce objective class should start in auction rather than cheap claim. This is a neutrality tradeoff if the class is human-curated.

Two or more independent excited whales materially reduce quiet capture of the obvious head, because a first whale's cheap claim on `bitcoin`, `satoshi`, short names, brands, and celebrity handles is likely to be contested by the second whale and forced into auction. That converts cheap capture into public price discovery.

This is a strong social mitigation but a weak protocol assumption. It only works if the whales are independent, capital-ready, watching the same claim stream, willing to contest rather than split the namespace, and not colluding. It protects high-salience names much more than obscure owner-specific names that neither whale notices or cares about. It can also worsen auction load and make launch look like a plutocratic duel if ordinary users cannot participate.

Best use: recruit whales as public watchtowers / contest backstops / infrastructure funders, not privileged allocators. Their existence should justify confidence in launch monitoring, not shorter protocol windows.

### 2. Cheap Contest Griefing Against Small Users

The simple-name path escalates a name if more than one DA-valid claimant appears in the notice window. This is neutral, but it lets an attacker force a little user out of the cheap path.

Attack shape:

- Monitor claims.
- Contest many names at the gate cost.
- The attacker may not want to win; they just force honest users into bonded auctions, where the user needs capital, wallet sophistication, and time.

Why it matters:

- The harm is not theft; it is friction and capital intimidation.
- This disproportionately hurts ordinary users during early adoption.
- If contesting costs only the cheap gate, the attacker can create many auctions cheaply, even if winning them remains expensive.

Mitigations:

- Require a contest to become an auction-opening bonded bid, not merely a second cheap claim. This increases contest cost but also raises the barrier for legitimate challengers.
- Make auction UX show "you are being contested; you can walk away or bid" clearly.
- Provide alternate-name suggestions and cheap re-claim flow so griefing one name does not end the user's session.
- Model grief cost: attacker cost per forced auction versus honest claimant cost.

### 3. Auction Closure Gaming

Open ascending L1 auctions with soft close are useful but full of edge cases.

Attack shapes:

- Late-bid grief: keep extending a soft close with minimum increments to waste attention and lock capital.
- Mempool/relay censorship: near close, delay or censor a competing bid.
- Miner games: include own or allied bid at a favorable close edge.
- Shill/self-bidding: create apparent competition or force a higher second price / higher visible price.
- Reorg edge: a bid or close appears final, then disappears.

Current posture:

- The default policy uses about a 7-day base window and 24-hour soft close.
- Late increments are stronger than normal increments.
- No hard extension cap is currently favored because a hard cap creates a known final sniping edge.

Mitigations:

- Define close purely by confirmed block facts, not mempool events.
- Require enough confirmations before UI treats an auction as settled.
- Keep soft-close increments meaningfully expensive.
- Consider sealed second-price / commit-reveal settlement for normal contested names; reserve open ascending auctions for rare marquee names where visibility is worth the risk.
- If keeping open ascending, model "extension grief cost" under worst-case fee and bid-increment assumptions.
- Specify bidder fallback when a relay/publisher censors the bid path.

### 4. Bond Deterrence Is Weaker Than It Sounds

ONT can invalidate a name if the designated bond UTXO is spent before maturity, but the bond is not script-locked or slashable by Bitcoin.

Attack shape:

- Win a name to deny it.
- Hold it through the commitment window.
- Walk or re-open cycles if the economics favor denial over ownership.

Why it matters:

- The attacker does not lose principal unless the protocol uses a script-level penalty construction.
- The deterrent is fees, opportunity cost, and losing the name, not slashing.

Mitigations:

- Be explicit in docs and UI: current bonds are ONT-enforced, not Bitcoin-script-locked.
- Model denial loops under a one-year lock and shorter/longer locks.
- Decide whether "lose the name" is sufficient or whether true slashing is worth the custody/script complexity.

### 5. Data Availability / Multi-Publisher Integration Gap

The DA and merge design is strong in notes/prototypes, but the live resolver/publisher path is not fully wired.

Attack shapes:

- Withhold batch bytes.
- Serve different data to different users.
- Anchor from a private publisher accumulator rather than the canonical root.
- Exploit one-publisher deployment as a censorship bottleneck.

Current posture:

- Fail-closed DA and availability marker design are documented and prototyped.
- Multi-publisher convergence logic exists in research/prototype code.
- The live resolver still does not consume the full cheap-rail derivation end to end.

Mitigations:

- Treat live multi-publisher canonical derivation as a launch gate for the cheap path.
- Pin DA windows and marker transaction format.
- Require wallets to distinguish provisional / contested / final.
- Never let a wallet record ownership from a publisher receipt alone.

### 6. Resolver / Light-Client Trust Gap

Resolver fanout can detect disagreement but cannot yet adjudicate it trustlessly.

Attack shape:

- Eclipse a client into attacker-controlled resolvers.
- Serve a false but internally consistent history.
- Exploit "longest history wins" heuristics.

Why it matters:

- ONT's claim is "ownership is derived from Bitcoin," but current light clients still need a path to verify Bitcoin inclusion and headers.

Mitigations:

- Light-client proof bundles that verify OP_RETURN anchors against Bitcoin headers.
- Multiple independent resolver defaults.
- Discovery that does not create a single project-controlled trust root.
- UI should label resolver-verified versus Bitcoin-header-verified answers.

### 7. Early-User Confidence Asymmetry

When only dozens or hundreds of people use ONT, the adversary may be more confident than honest users.

Attack shape:

- A sophisticated whale is comfortable locking and moving self-custodied BTC.
- Ordinary users, brands, and agents are not yet comfortable signing project-built transactions or locking bonds.
- The adversary wins not because the protocol is wrong, but because participation friction is asymmetric.

Why it matters:

- Auction price discovery is poor in an empty room.
- "Open auction" does not mean fair if the people who care are not present yet.

Mitigations:

- Long public signet/mainnet-candidate rehearsal.
- Independent audits and reproducible wallet builds before mainnet.
- Simple watch-only alerting for people who are not ready to bid yet.
- Clear "claim is provisional" language.
- Reputable launch publishers and a self-claim fallback.
- Claim/contest sponsorship or concierge tooling for early legitimate users, while keeping protocol rules neutral.

### 8. Operational Capture During Launch

The reference wallet, publisher, resolver, website, or social channel can become de facto authority.

Attack shape:

- Compromise or impersonate the official wallet/publisher.
- Phish users into signing bids or sending funds.
- DDoS the only practical publisher/resolver.
- Use default endpoints to censor or shape early allocation.

Mitigations:

- Reproducible builds and signed releases.
- Multiple independent publishers/resolvers from day one.
- Public status pages and mirrors.
- Clear endpoint switching.
- Hard-line messaging: the official client is reference software, not authority.

## Bottom Line

The hardest adversarial problem is not "can a whale pay a lot?" ONT intentionally lets anyone pay a lot. The hardest problem is whether early allocations are visibly contestable enough that later users accept the outcome as legitimate.

For launch, the system needs burst containment: long windows, live transparency, watcher tools, conservative auction-close rules, and multiple independent infrastructure operators. For the long run, the system needs tail compression: most personal/agent/business claims must remain cheap and off-L1 unless genuinely disputed.

## Sources

- `/Users/davidking/dev/ont/docs/research/ONT_ADVERSARIAL_ANALYSIS.md`
- `/Users/davidking/dev/ont/docs/research/ONT_CONTEST_WINDOW_PHILOSOPHY.md`
- `/Users/davidking/dev/ont/docs/design/ONT_ACQUISITION_STATE_MACHINE.md`
- `/Users/davidking/dev/ont/docs/design/ONT_RISK_REGISTER.md`
- `/Users/davidking/dev/ont/docs/design/ONT_RISKS_PLAIN_LANGUAGE.md`
- `/Users/davidking/dev/ont/docs/design/ONT_MEV_ORDERING_ANALYSIS.md`
- `/Users/davidking/dev/ont/docs/launch/CONTESTED_AUCTION_REFERENCE.md`
- `/Users/davidking/dev/ont/docs/research/ONT_MULTI_PUBLISHER_CONVERGENCE.md`
- `/Users/davidking/dev/ont/docs/design/ONT_DATA_AVAILABILITY_AGREEMENT.md`
- `/Users/davidking/dev/ont/docs/research/ONT_WALLET_AND_ONBOARDING_DIRECTION.md`
