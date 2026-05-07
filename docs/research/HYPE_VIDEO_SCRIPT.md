# ONT Hype Video Script

This is a messaging draft for the short ONT explainer / hype video.

It is intentionally script-like rather than protocol-spec-like. The goal is to make the core ideas legible quickly, while staying aligned with the deeper docs.

## Current Draft

Bitcoin addresses are not a human interface.

If you are paying someone or approving a merchant, raw addresses and opaque account strings are a bad final interface.

Readable payment handles exist, but they usually depend on a service provider, account, domain, or operator.

Open Name Tags is a different approach.

An ONT name is a human-readable payment handle anchored to Bitcoin. It gives you a way to say who should get paid before money moves, without relying on a gatekeeper-controlled alias.

There is still a cost to acquiring a name. Naming is never free. The difference is what kind of cost it is.

Most naming systems make you pay a third party. ONT uses a bond instead. You lock bitcoin you still own. That bond has a real financial cost because capital has time value and opportunity cost, but it does not have to be paid to a registrar, a company, or a treasury. It is pricing without tribute to a gatekeeper.

Here is how it works.

To acquire a name, you participate in an auction and bond bitcoin you still own. The name goes through settlement, then the winning bond remains in its maturity period. After maturity, the bond can move without breaking ownership. The name remains yours.

What the name points to can change. A payment address first; other owner-signed destination records later if clients support them. Those records live off-chain and are signed by the current owner. The mutable pointer stays lightweight. The ownership record is what stays permanent.

This matters even more as software starts acting on your behalf. Let the model infer what you want. Do not let the model guess who gets paid. When software routes a payment without a human inspecting every character, the final destination should not rest on a probabilistic guess. ONT gives human-readable payment handles cryptographically grounded ownership.

Other naming systems charge rent or depend on organizations that can change terms, remove access, or govern the namespace for their own interests. ONT is meant to be different: no token, no founder allocation, no whitelist, no protocol-level sale of names. Just a public namespace open under the same rules for everyone.

The first proof point is simple: pay the right person in words you control. Broader destination uses can come later. The payment problem alone is already real.

ONT is currently live on a private signet: a controlled Bitcoin test environment where anyone can inspect the idea, search names, review auctions, and verify the ownership history for themselves.

A payment handle you control, anchored to Bitcoin, for choosing who gets paid before money moves.

That is Open Name Tags.

## Messaging Notes

- Lead first with payment handles, not with generic naming ambition.
- Lead with the idea that bonds are still pricing, but a special form of pricing.
- Emphasize that ONT does not make naming free; it changes who gets paid and what the winning bidder retains.
- Keep the difference between:
  - ordinary Bitcoin fee-market costs
  - and the protocol's own bond pricing
  clear in spoken explanations.
