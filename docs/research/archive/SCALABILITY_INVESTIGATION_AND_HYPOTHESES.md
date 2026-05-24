# ONT Scalability Investigation And Hypotheses

This document records the research path behind ONT's current scalability
position. It is design support for review, not a v1 protocol commitment.

v1 remains direct L1 bonded flat names plus owner-signed records.

## Conclusion

Direct L1 issuance is credible for scarce, high-assurance names, but it is not
credible as the only path for every person, organization, app, device, and
agent.

The leading scalability hypothesis is:

> Use Bitcoin L1 for scarce or disputed names, and use public-batch sponsored
> claims for the long tail. A sponsored claim finalizes cheaply only after
> public notice, data availability, and an open challenge window. If contested,
> it falls back to the normal L1 bonded auction path.

This is not "L1 sovereignty for free." It is an optimistic public issuance
system with explicit assurance tiers and L1 dispute fallback.

## Investigation Process

We investigated scale from four angles:

1. How many direct L1 names can Bitcoin blockspace plausibly support?
2. How concentrated are real naming conflicts in existing namespaces?
3. What contest rate would make sponsored issuance viable or non-viable?
4. What protocol rules are needed so sponsored claims do not become hidden
   registrar control?

The working answer is that scale is plausible if most names are long-tail and
uncontested, and if "uncontested" means public, monitorable, challengeable, and
replayable.

## L1 Capacity Baseline

Bitcoin has about `52.6B vB/year` of theoretical blockspace:

```text
4,000,000 weight units/block
/ 4 = 1,000,000 vB/block
* 144 blocks/day
* 365 days/year
= 52.56B vB/year
```

If ONT used `1%` of Bitcoin blockspace, that is about `526M vB/year`.
If ONT used `5%`, that is about `2.63B vB/year`.

Rough direct L1 name capacity:

| Direct L1 model | Approx vB/name | 1% blockspace | 5% blockspace |
| --- | ---: | ---: | ---: |
| Minimal 1-tx name | `300` | `1.75M/year` | `8.8M/year` |
| Auction, 3 bids average | `900` | `584k/year` | `2.9M/year` |
| Auction, 5 bids average | `1500` | `350k/year` | `1.75M/year` |
| Off-chain auction, L1 winner-only hardening | `110` | `4.78M/year` | `23.9M/year` |

These numbers are enough for a strong root/high-assurance layer. They are not
enough for billions of global names.

## External Namespace Reference Points

Existing namespaces are extremely long-tailed.

Instagram reached about `3B` monthly active users in September 2025, implying a
multi-billion active-handle namespace even though total historical registrations
are not publicly disclosed. Most handles are personal variants, numbers,
underscores, local brands, creator names, bots, or inactive-looking long-tail
strings. The obviously scarce/conflict-heavy set is much smaller: short words,
major brands, celebrities, common first names, and high-status handles.

Applied to the ONT contest-rate rubric:

| Instagram-like bucket | Instagram-style examples | ONT examples | ONT contest intuition |
| --- | --- | --- | --- |
| Global celebrity/brand/status handles | `nike`, `apple`, `taylorswift`, `bitcoin` | `nike`, `apple`, `satoshi`, `bitcoin` | likely contested |
| Short/common human handles | `alex`, `maya`, `dk`, `max` | `alice`, `max`, `dk`, `sam` | often or sometimes contested |
| Real person or creator variants | `davidking`, `davidkingofficial`, `matbalez` | `davidking`, `matbalez`, `rodesfishburne` | occasionally contested |
| Local business/community handles | `acmecoffee`, `sunsetplumbing`, `austinpilates` | `acmecoffee`, `sunsetplumbing`, `austinpilates` | occasionally contested |
| Long-tail variants and agent/app handles | `davidking42`, `agent719`, `shopname_la` | `davidking42`, `agent719`, `shopname_la` | rarely contested |

The Instagram analogy is useful because a multi-billion-handle namespace works
only because most handles are not globally scarce. The same could be true for
ONT if ordinary names are cheap to publish but scarce names can be challenged
into L1 auctions.

DNS is useful as a scarcity-distribution reference point, not as a legal-dispute
proxy. Verisign reported `386.9M` domain name registrations across TLDs at the
end of Q4 2025. That does not mean there are `386.9M` equally scarce names.
Most registered domains are long-tail compounds, local business names,
campaign-specific names, SEO phrases, defensive registrations, numeric
variants, or names duplicated across many TLDs. The obvious conflict-heavy set
is much smaller.

Applied to the ONT contest-rate rubric:

| DNS-like bucket | DNS examples | ONT examples | Rough share of registrations | ONT contest intuition |
| --- | --- | --- | ---: | --- |
| Ultra-premium | `bank.com`, `ai.com`, `bitcoin.com` | `bitcoin`, `ai`, `bank`, `satoshi` | tiny, well under `0.1%` | likely contested |
| Short/common/brandable | `alice.com`, `pay.com`, `river.com`, 2-4 char strings | `alice`, `pay`, `river`, `agent`, `dk` | small, maybe `0.1%-1%` | often or sometimes contested |
| Owner-specific names | exact companies, people, projects, local businesses | `davidking`, `matbalez`, `sunsetplumbing`, `acmecoffee` | meaningful minority | occasionally contested |
| Long-tail compounds | `sunsetplumbingdenver.com`, campaign names, product phrases | `davidking42`, `agent719`, `sunsetplumbingdenver`, `acmecoffeeaustin` | large majority | rarely contested |
| Defensive/speculative variants | typo, TLD, plural, hyphen, numeric variants | `payapp`, `bitcoinwallet`, `satoshipayments`, plural/typo variants | large but uneven | mostly uncontested unless near valuable brands |

These percentages are not measured claims; they are a rubric for thinking about
scarcity. The key observation is that DNS scale is carried by the long tail,
while economic conflict concentrates in the head.

ENS is useful as a blockchain-naming adoption reference, not as a contest-rate
reference. ENS reports over `3.5M` `.eth` names registered over its first seven
years. That shows crypto-native naming can reach millions of names, but it does
not answer global-scale identity or Bitcoin blockspace constraints.

Sources:

- Instagram `3B` MAU: [CNBC](https://www.cnbc.com/2025/09/24/instagram-now-has-3-billion-monthly-active-users.html), [TechCrunch](https://techcrunch.com/2025/09/24/instagram-now-has-3-billion-monthly-active-users-will-test-features-to-help-users-control-their-feeds/)
- DNS `386.9M` registrations: [Verisign DNIB Q4 2025](https://investor.verisign.com/news-releases/news-release-details/dnibcom-reports-internet-has-3869-million-domain-name/)
- ENS `3.5M+` names: [ENS DAO basics](https://basics.ensdao.org/about-ens)

## Contest Rate Intuition

Contest rate means:

> The percentage of sponsored claims that receive a valid UTXO-backed competing
> claim and route into the normal L1 auction path.

Name conflicts are likely concentrated in the head of the distribution. DNS and
Instagram both point in the same direction: a small number of short, common,
brand-like, or culturally important strings carry most of the obvious scarcity,
while the total namespace is dominated by long-tail owner-specific strings.

| Name bucket | Examples | Expected contest behavior |
| --- | --- | --- |
| Ultra-premium | `bitcoin`, `google`, `ai`, `bank` | often contested |
| Short/common | `alice`, `john`, `pay`, `agent` | sometimes contested |
| Real people/businesses | `davidking`, `sunsetplumbing` | occasionally contested |
| Long-tail variants | `davidking42`, `agent_719`, `shopname_la` | rarely contested |
| Bulk/speculative inventory | many low-salience claims | depends on transferability and monitoring |

The current modeling stance:

- `10%` contested is a launch/adversarial stress case.
- `1%` contested is a conservative broad-namespace planning case.
- `0.1%` contested is plausible for a mature network dominated by long-tail
  names.

We should not claim any one number is "right." The DNS rubric mostly argues
against using `10%` as the normal mature-network assumption. It does not prove
`0.1%`; it supports testing `0.1%-1%` as plausible if issuance is dominated by
long-tail names and challengers must post real capital. The protocol should
degrade safely if the contest rate is higher than expected.

## Sponsored Issuance Capacity Model

Sponsored issuance has three separate limits:

```text
sponsored names/year =
min(available sponsor credits,
    public-log/data-availability capacity,
    L1 contest capacity / contest_rate)
```

The L1 contest term is the key scaling multiplier.

Using the rough `1%` blockspace, `3-bid average` L1 auction capacity of
`584k contested auctions/year`:

| Sponsored contest rate | L1 auctions/year | Implied sponsored attempts/year |
| ---: | ---: | ---: |
| `10%` | `584k` | `5.8M` |
| `1%` | `584k` | `58M` |
| `0.1%` | `584k` | `584M` |

Using `5%` blockspace, multiply those sponsored-attempt figures by roughly `5`.

This is why the long-tail hypothesis matters. If most sponsored names are
boring enough that they are not worth challenging, L1 is used mostly for scarce
or disputed names. If many sponsored names are contested, the design naturally
falls back toward the L1 bottleneck.

## Sponsor Credits Are A Separate Limit

Contest-rate math does not create capacity by itself. Sponsors must have enough
credits to attempt sponsored issuance.

Early after launch, credit supply may be the binding constraint because:

- sponsor credits may not exist until direct L1 bonds mature
- parameters may be conservative
- credit accrual may begin only after a future sponsor-credit activation, not
  retroactively from v1 launch
- credit expiration and global caps may intentionally slow issuance

Later, if there are many mature bonds and generous parameters, L1 contest
capacity and public-log/data-availability capacity may become the binding
constraints.

## Why Scalability Looks Achievable

Scalability looks achievable if these hypotheses hold:

1. The namespace is long-tailed, like Instagram handles and DNS domains.
2. Most ordinary names are not worth a capital-backed challenge.
3. Public notice makes "uncontested" a legitimate market result.
4. Direct L1 remains available for scarce, disputed, or high-assurance names.
5. Sponsor credits, public logs, and proof bundles can be replayed without
   trusting a registrar.
6. Clients display assurance tiers instead of pretending sponsored names are
   identical to direct L1 names.

During bootstrap, initial ONT project operators should commit to multi-year
resolver, relay, and mirror support. That improves early data availability, but
it should be treated as operational scaffolding. The sovereignty claim still
depends on exportable logs, portable proof bundles, independent mirrors, and
direct L1 fallback.

The important architectural point is that v1 does not need to know the final
sponsor-credit parameters. It does need to preserve the extension points:

- acquisition-source-tagged proof bundles
- owner keys as the stable authority layer
- direct L1 fallback
- replayable resolver/indexer data
- assurance tiers
- public-notice requirements for optimistic issuance

## What Would Falsify The Hypothesis

The scalability story gets weaker if:

- the actual contest rate remains near `10%` after launch speculation settles
- sponsor credits cannot be double-spend protected without trusted registrars
- public notice cannot prevent quiet/private finality
- resolvers cannot keep batch data available and mirrorable
- users reject assurance tiers and demand L1-equivalent guarantees for every
  name
- early sponsor-credit economics create concentrated issuer capture

These are the right pre-launch review questions. The goal is not to claim the
scale path is finished; it is to show that v1 is not a dead end and that the
leading scale path has concrete assumptions reviewers can challenge.

## Design Position

ONT should present v1 and scaling this way:

> v1 creates a scarce, Bitcoin-anchored, high-assurance root primitive. The
> credible scale path is to keep that primitive for scarce/disputed names while
> adding optimistic public-batch sponsored issuance for the long tail. Sponsored
> names require public notice, data availability, challenge rights, proof
> bundles, and explicit assurance tiers. They are a scale path, not a claim that
> every low-cost name has the same assurance as a direct L1 bond.
